export interface PlatformConfig {
 id: string;
 name: string;
 icon: string;
 defaultPath: string;
 isCustom?: boolean;
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
 },
 {
 id: 'claude-code',
 name: 'Claude Code',
 icon: '/platforms/claude.png',
 defaultPath: '%USERPROFILE%\\.claude\\skills'
 }
];

export const DEFAULT_ENABLED_PLATFORMS = ['vscode-copilot', 'cursor', 'trae', 'antigravity', 'claude-code'];

export interface UserPlatformSettings {
 enabledPlatforms: string[];
 customPaths: Record<string, string>;
 customPlatforms: PlatformConfig[];
}

export const DEFAULT_USER_SETTINGS: UserPlatformSettings = {
 enabledPlatforms: DEFAULT_ENABLED_PLATFORMS,
 customPaths: {},
 customPlatforms: []
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export function normalizeUserPlatformSettings(raw: unknown): UserPlatformSettings {
 if (!isRecord(raw)) {
 return DEFAULT_USER_SETTINGS;
 }

 const enabledPlatforms = Array.isArray(raw.enabledPlatforms)
 ? raw.enabledPlatforms.filter((id): id is string => typeof id === 'string')
 : DEFAULT_ENABLED_PLATFORMS;

 const customPaths = isRecord(raw.customPaths)
 ? Object.fromEntries(
 Object.entries(raw.customPaths).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
 )
 : {};

 const customPlatforms = Array.isArray(raw.customPlatforms)
 ? raw.customPlatforms.filter((platform): platform is PlatformConfig => {
 return isRecord(platform)
 && typeof platform.id === 'string'
 && typeof platform.name === 'string'
 && typeof platform.defaultPath === 'string';
 }).map(platform => ({
 id: platform.id,
 name: platform.name,
 icon: typeof platform.icon === 'string' ? platform.icon : '',
 defaultPath: platform.defaultPath,
 isCustom: true
 }))
 : [];

 return {
 enabledPlatforms: Array.from(new Set(enabledPlatforms)),
 customPaths,
 customPlatforms
 };
}

export function getAllPlatforms(settings: UserPlatformSettings): PlatformConfig[] {
 return [...ALL_PLATFORMS, ...(settings.customPlatforms || [])];
}
