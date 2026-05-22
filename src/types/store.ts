export interface StoreRepo {
  id: string;
  type: 'github' | 'gerrit';
  owner: string;
  repo: string;
  name: string;
  url: string;
  /** SSH username for Gerrit repos */
  sshUser?: string;
  /** Git branch name */
  branch?: string;
  /** Path inside the repo where skills live ('skills' or '') */
  skillsPath: string;
  skillCount: number;
}

export interface StoreSkill {
  name: string;
  /** Full path inside the repo, e.g. "skills/pdf" or "confluence-search" */
  path: string;
  owner: string;
  repo: string;
  description?: string;
  htmlUrl?: string;
}
