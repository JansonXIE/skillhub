export interface StoreRepo {
  id: string;
  owner: string;
  repo: string;
  name: string;
  url: string;
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
