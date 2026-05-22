import { invoke } from '@tauri-apps/api/core';
import type { StoreRepo, StoreSkill } from '../types/store';

/**
 * Parse a Gerrit URL and extract host, port, and project path.
 * Supports: ssh://user@host:port/project, https://host:port/project
 */
export function parseGerritUrl(url: string): { host: string; port?: string; project: string; user?: string } | null {
  try {
    const cleaned = url.trim().replace(/\/$/, '');
    // ssh://user@gerrit-ai.sophgo.vip:29418/bsp-skills-hub
    const sshMatch = cleaned.match(/^ssh:\/\/([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (sshMatch) {
      return {
        user: sshMatch[1],
        host: sshMatch[2],
        port: sshMatch[3],
        project: sshMatch[4].replace(/\.git$/, ''),
      };
    }
    // https://host:port/project
    const httpsMatch = cleaned.match(/^https?:\/\/([^/:]+)(?::(\d+))?\/(.+)/);
    if (httpsMatch) {
      return {
        host: httpsMatch[1],
        port: httpsMatch[2],
        project: httpsMatch[3].replace(/\.git$/, ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect whether a URL is a Gerrit URL.
 */
export function isGerritUrl(url: string): boolean {
  return url.includes('gerrit') || url.startsWith('ssh://');
}

/**
 * Generate a stable store ID from URL info.
 */
export function generateStoreId(type: 'github' | 'gerrit', identifier: string): string {
  return `${type}-${identifier.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Fetch skills from a store repo (GitHub or Gerrit).
 * For Gerrit repos, uses git clone via Tauri backend.
 */
export async function fetchStoreSkills(repo: StoreRepo): Promise<StoreSkill[]> {
  if (repo.type === 'github') {
    // Use existing GitHub API logic
    const { fetchSkillsFromRepo } = await import('./github');
    return fetchSkillsFromRepo(repo.owner, repo.repo, repo.skillsPath);
  }

  // Gerrit / git-based access via Tauri backend
  const branch = repo.branch || 'master';
  const storeId = repo.id;
  const result: string = await invoke('fetch_store_skills', {
    repoUrl: repo.url,
    branch,
    storeId,
  });

  const items: { name: string; path: string; skills_path: string }[] = JSON.parse(result);
  return items.map(item => ({
    name: item.name,
    path: item.path,
    owner: repo.owner,
    repo: repo.repo,
  }));
}

/**
 * Fetch the content of a skill from a store repo.
 */
export async function fetchStoreSkillContent(
  repo: StoreRepo,
  skillPath: string
): Promise<string> {
  if (repo.type === 'github') {
    const { fetchSkillContent } = await import('./github');
    return fetchSkillContent(repo.owner, repo.repo, skillPath);
  }

  const branch = repo.branch || 'master';
  const storeId = repo.id;
  return invoke('fetch_store_skill_content', {
    repoUrl: repo.url,
    branch,
    storeId,
    skillPath,
  });
}

/**
 * Import a skill from a store repo (GitHub or Gerrit).
 */
export async function importSkillFromStoreRepo(
  repo: StoreRepo,
  skillName: string,
  skillPath: string
): Promise<string> {
  if (repo.type === 'github') {
    const { importSkillFromStore: importGithub } = await import('./importStore');
    return importGithub(repo.owner, repo.repo, skillName, skillPath);
  }

  let dataPath = localStorage.getItem('skillhub-data-path');
  if (!dataPath) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const baseDir = await appDataDir();
    dataPath = await join(baseDir, 'SkillsHub');
  }

  const branch = repo.branch || 'master';
  const storeId = repo.id;
  return invoke('import_skill_from_store', {
    dataPath,
    repoUrl: repo.url,
    branch,
    storeId,
    skillName,
    skillPath,
  });
}

/**
 * Detect repo structure for a Gerrit repo using git.
 */
export async function detectGerritStructure(
  repoUrl: string,
  branch: string,
  storeId: string
): Promise<string> {
  const result: string = await invoke('fetch_store_skills', {
    repoUrl,
    branch,
    storeId,
  });

  const items: { name: string; path: string; skills_path: string }[] = JSON.parse(result);
  // If any skill path starts with "skills/", then skillsPath is "skills"
  if (items.length > 0 && items[0].skills_path) {
    return items[0].skills_path;
  }
  return '';
}