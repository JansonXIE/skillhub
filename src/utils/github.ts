import type { StoreSkill } from '../types/store';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';

/**
 * Parse a GitHub URL and extract owner and repo.
 * Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const cleaned = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  html_url: string;
  download_url: string | null;
}

/**
 * Detect whether a repo has a `skills/` subdirectory.
 * Returns the skills path ('skills' if found, '' if not).
 */
export async function detectRepoStructure(owner: string, repo: string): Promise<string> {
  const cacheKey = `store-structure-${owner}-${repo}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items: GitHubContentItem[] = await res.json();
    const hasSkillsDir = items.some(item => item.type === 'dir' && item.name === 'skills');
    const result = hasSkillsDir ? 'skills' : '';
    sessionStorage.setItem(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Failed to detect repo structure:', error);
    return '';
  }
}

/**
 * Fetch all skill directories from a given path in the repo.
 * Filters out hidden dirs (starting with .), template, spec, etc.
 */
export async function fetchSkillsFromRepo(
  owner: string,
  repo: string,
  skillsPath: string
): Promise<StoreSkill[]> {
  const cacheKey = `store-skills-${owner}-${repo}-${skillsPath}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* continue */ }
  }

  const apiPath = skillsPath ? `contents/${skillsPath}` : 'contents/';
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/${apiPath}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch skills: HTTP ${res.status}`);
  
  const items: GitHubContentItem[] = await res.json();
  
  // Filter: only directories, exclude hidden dirs and common non-skill dirs
  const excludeNames = new Set(['.github', '.git', '.vscode', 'template', 'spec', 'node_modules', 'dist', '.claude-plugin']);
  const skills: StoreSkill[] = items
    .filter(item => item.type === 'dir' && !item.name.startsWith('.') && !excludeNames.has(item.name))
    .map(item => ({
      name: item.name,
      path: item.path,
      owner,
      repo,
      htmlUrl: item.html_url,
    }));

  sessionStorage.setItem(cacheKey, JSON.stringify(skills));
  return skills;
}

/**
 * Fetch the SKILL.md content for a specific skill via GitHub raw content.
 */
export async function fetchSkillContent(
  owner: string,
  repo: string,
  skillPath: string
): Promise<string> {
  const cacheKey = `store-content-${owner}-${repo}-${skillPath}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;

  // Try SKILL.md first, then README.md
  for (const filename of ['SKILL.md', 'README.md']) {
    try {
      const url = `${GITHUB_RAW}/${owner}/${repo}/main/${skillPath}/${filename}`;
      const res = await fetch(url);
      if (res.ok) {
        const content = await res.text();
        sessionStorage.setItem(cacheKey, content);
        return content;
      }
    } catch { /* try next */ }
  }

  // Fallback: try master branch
  for (const filename of ['SKILL.md', 'README.md']) {
    try {
      const url = `${GITHUB_RAW}/${owner}/${repo}/master/${skillPath}/${filename}`;
      const res = await fetch(url);
      if (res.ok) {
        const content = await res.text();
        sessionStorage.setItem(cacheKey, content);
        return content;
      }
    } catch { /* try next */ }
  }

  return '暂无内容';
}

/**
 * Extract description from SKILL.md content (frontmatter or first line).
 */
export function extractDescription(content: string): string {
  if (!content || content === '暂无内容') return '暂无描述';

  const trimmed = content.trim();

  // Try YAML frontmatter first
  if (trimmed.startsWith('---')) {
    const parts = trimmed.split('---');
    if (parts.length >= 3) {
      const frontmatter = parts[1];
      for (const line of frontmatter.split('\n')) {
        const t = line.trim();
        if (t.toLowerCase().startsWith('description:')) {
          let desc = t.substring(12).trim();
          if ((desc.startsWith('"') && desc.endsWith('"')) || (desc.startsWith("'") && desc.endsWith("'"))) {
            desc = desc.slice(1, -1);
          }
          return desc;
        }
      }
    }
  }

  // Fallback: first non-empty, non-heading line
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t !== '---') {
      return t.length > 120 ? t.substring(0, 120) + '...' : t;
    }
  }

  return '暂无描述';
}

/**
 * Fetch the file tree of a skill directory (recursive).
 * Returns an array of { path, download_url } for all files.
 */
export async function fetchSkillFileTree(
  owner: string,
  repo: string,
  skillPath: string
): Promise<{ path: string; download_url: string }[]> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${skillPath}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch file tree: HTTP ${res.status}`);

  const items: GitHubContentItem[] = await res.json();
  const files: { path: string; download_url: string }[] = [];

  for (const item of items) {
    if (item.type === 'file' && item.download_url) {
      // Store relative path (relative to skill root)
      const relativePath = item.path.startsWith(skillPath + '/')
        ? item.path.substring(skillPath.length + 1)
        : item.name;
      files.push({ path: relativePath, download_url: item.download_url });
    } else if (item.type === 'dir') {
      // Recurse into subdirectories
      const subFiles = await fetchSkillFileTree(owner, repo, item.path);
      files.push(...subFiles.map(f => ({
        path: item.name + '/' + f.path,
        download_url: f.download_url,
      })));
    }
  }

  return files;
}

/**
 * Invalidate cached data for a specific repo.
 */
export function invalidateRepoCache(owner: string, repo: string): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.includes(`${owner}-${repo}`)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
}
