export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  defaultPath: string;
}

export const ALL_PLATFORMS: PlatformConfig[] = [
  { 
    id: 'vscode-copilot', 
    name: 'GitHub Copilot', 
    icon: '/platforms/githubcopilot.svg',
    defaultPath: '%USERPROFILE%\\.copilot\\skills'
  },
  { 
    id: 'cursor', 
    name: 'Cursor', 
    icon: '/platforms/cursor.png',
    defaultPath: '%USERPROFILE%\\.cursor\\skills'
  },
  { 
    id: 'gemini', 
    name: 'Gemini CLI', 
    icon: '/platforms/gemini.png',
    defaultPath: '%USERPROFILE%\\.gemini\\skills' 
  },
  { 
    id: 'antigravity', 
    name: 'Antigravity', 
    icon: '/platforms/antigravity.svg',
    defaultPath: '%USERPROFILE%\\.gemini\\antigravity\\skills' 
  },
  { 
    id: 'windsurf', 
    name: 'Windsurf', 
    icon: '/platforms/windsurf.png',
    defaultPath: '%USERPROFILE%\\.codeium\\windsurf\\skills' 
  },
  { 
    id: 'trae', 
    name: 'Trae', 
    icon: '/platforms/trae.png',
    defaultPath: '%USERPROFILE%\\.trae\\skills' 
  },
  { 
    id: 'qoder', 
    name: 'Qoder', 
    icon: '/platforms/qoder.png',
    defaultPath: '%USERPROFILE%\\.qoder\\skills' 
  }
];

export const DEFAULT_ENABLED_PLATFORMS = ['vscode-copilot', 'cursor', 'trae', 'antigravity'];

export interface UserPlatformSettings {
  enabledPlatforms: string[];
  customPaths: Record<string, string>;
}

export const DEFAULT_USER_SETTINGS: UserPlatformSettings = {
  enabledPlatforms: DEFAULT_ENABLED_PLATFORMS,
  customPaths: {}
};
