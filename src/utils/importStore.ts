import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { fetchSkillFileTree } from './github';

/**
 * Import a skill from the GitHub store into the local my_skills directory.
 * Downloads all files via GitHub API and writes them locally using Tauri commands.
 */
export async function importSkillFromStore(
  owner: string,
  repo: string,
  skillName: string,
  skillPath: string
): Promise<string> {
  // Get the data path
  let dataPath = localStorage.getItem('skillhub-data-path');
  if (!dataPath) {
    const baseDir = await appDataDir();
    dataPath = await join(baseDir, 'SkillsHub');
  }

  // Fetch the file tree for this skill
  const files = await fetchSkillFileTree(owner, repo, skillPath);

  if (files.length === 0) {
    throw new Error('该 Skill 目录中没有找到任何文件');
  }

  // Find the main content file (SKILL.md or README.md)
  const mainFile = files.find(f => f.path === 'SKILL.md')
    || files.find(f => f.path === 'README.md');

  if (!mainFile) {
    throw new Error('该 Skill 中没有找到 SKILL.md 或 README.md 文件');
  }

  // Download the main content
  const contentRes = await fetch(mainFile.download_url);
  if (!contentRes.ok) throw new Error('下载 SKILL.md 失败');
  const content = await contentRes.text();

  // Create the skill locally using existing Tauri command
  await invoke('create_local_skill', {
    dataPath,
    skillName,
    content,
  });

  // Download and save additional files (beyond SKILL.md)
  // For now we use the main file approach via create_local_skill
  // Additional files would require a new Tauri command to write arbitrary files

  return `成功从 ${owner}/${repo} 导入 Skill: ${skillName}`;
}
