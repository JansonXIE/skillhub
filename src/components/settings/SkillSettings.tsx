import { useState, useEffect } from 'react';
import { Sparkles, Folder, Plus, Trash2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import {
 DEFAULT_USER_SETTINGS,
 getAllPlatforms,
 normalizeUserPlatformSettings,
 type PlatformConfig,
 type UserPlatformSettings
} from '../../config/platforms';

export function SkillSettings() {
 const [settings, setSettings] = useState<UserPlatformSettings>(DEFAULT_USER_SETTINGS);

 useEffect(() => {
 try {
 const stored = localStorage.getItem('skillhub-platforms-config');
 if (stored) {
 setSettings(normalizeUserPlatformSettings(JSON.parse(stored)));
 }
 } catch (e) {
 console.error('Failed to parse platform settings', e);
 }
 }, []);

 const updateSettings = (updater: (prev: UserPlatformSettings) => UserPlatformSettings) => {
 setSettings(prev => {
 const next = normalizeUserPlatformSettings(updater(prev));
 localStorage.setItem('skillhub-platforms-config', JSON.stringify(next));
 return next;
 });
 };

 const handleTogglePlatform = (id: string) => {
 updateSettings(prev => {
 const isEnabled = prev.enabledPlatforms.includes(id);
 const newEnabled = isEnabled
 ? prev.enabledPlatforms.filter(p => p !== id)
 : [...prev.enabledPlatforms, id];
 return { ...prev, enabledPlatforms: newEnabled };
 });
 };

 const handlePathChange = (id: string, path: string) => {
 updateSettings(prev => ({
 ...prev,
 customPaths: {
 ...prev.customPaths,
 [id]: path
 }
 }));
 };

 const handleAddCustomDirectory = async () => {
 const name = window.prompt('请输入自定义目录名称');
 const trimmedName = name?.trim();
 if (!trimmedName) return;

 try {
 const selected = await open({
 directory: true,
 multiple: false,
 title: `选择 ${trimmedName} 存放路径`,
 });

 if (selected && typeof selected === 'string') {
 updateSettings(prev => {
 const id = `custom-directory-${Date.now()}`;
 const customPlatform: PlatformConfig = {
 id,
 name: trimmedName,
 icon: '',
 defaultPath: selected,
 isCustom: true
 };

 return {
 ...prev,
 enabledPlatforms: [...prev.enabledPlatforms, id],
 customPaths: {
 ...prev.customPaths,
 [id]: selected
 },
 customPlatforms: [...prev.customPlatforms, customPlatform]
 };
 });
 }
 } catch (err) {
 console.error('Failed to open directory dialog', err);
 }
 };

 const handleDeleteCustomDirectory = (id: string) => {
 if (!window.confirm('确定删除该自定义目录吗？')) return;

 updateSettings(prev => {
 const { [id]: _removedPath, ...customPaths } = prev.customPaths;
 return {
 ...prev,
 enabledPlatforms: prev.enabledPlatforms.filter(platformId => platformId !== id),
 customPaths,
 customPlatforms: prev.customPlatforms.filter(platform => platform.id !== id)
 };
 });
 };

 const handleSelectPlatformDirectory = async (platform: PlatformConfig) => {
 try {
 const selected = await open({
 directory: true,
 multiple: false,
 title: `选择 ${platform.name} 存放路径`,
 });

 if (selected && typeof selected === 'string') {
 handlePathChange(platform.id, selected);
 if (platform.isCustom) {
 updateSettings(prev => ({
 ...prev,
 customPlatforms: prev.customPlatforms.map(item => (
 item.id === platform.id ? { ...item, defaultPath: selected } : item
 ))
 }));
 }
 }
 } catch (err) {
 console.error('Failed to open directory dialog', err);
 }
 };

 const renderPlatformIcon = (platform: PlatformConfig, size =20) => {
 if (!platform.icon) {
 return <Folder size={size} className="text-secondary" />;
 }

 return (
 <img
 src={platform.icon}
 alt={platform.name}
 style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', borderRadius: '3px' }}
 onError={(e) => {
 e.currentTarget.style.display = 'none';
 }}
 />
 );
 };

 const platforms = getAllPlatforms(settings);

 return (
 <div className="settings-section fade-in">
 <div className="flex items-center justify-between mb-6">
 <h2 className="settings-title mb-0 flex items-center gap-2">
 <Sparkles size={20} className="text-primary" />
 Skill 存放目录
 </h2>
 <button
 className="btn btn-secondary focus:outline-none"
 onClick={handleAddCustomDirectory}
 >
 <Plus size={16} className="mr-1 inline" />
 添加自定义目录
 </button>
 </div>

 <div className="flex flex-col gap-6">
 {platforms.map(platform => {
 const isEnabled = settings.enabledPlatforms.includes(platform.id);
 const customPath = settings.customPaths[platform.id] || '';

 return (
 <div key={platform.id} className="settings-group">
 <h3 className="settings-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 {renderPlatformIcon(platform)}
 {platform.name}
 </h3>

 <div className="settings-card">
 <div className="settings-card-icon">
 <Folder size={20} className="text-secondary" />
 </div>

 <div className="settings-card-info" style={{ flex:1, minWidth:0 }}>
 <div className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
 <span>存放路径</span>
 <label className="cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
 <input
 type="checkbox"
 className="accent-primary"
 style={{ width: '14px', height: '14px', margin:0 }}
 checked={isEnabled}
 onChange={() => handleTogglePlatform(platform.id)}
 />
 <span>在平台集成中启用</span>
 </label>
 </div>
 <div className="settings-card-desc" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
 <span className="text-main truncate" style={{ maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {customPath || platform.defaultPath || '未配置'}
 </span>
 </div>
 </div>

 {platform.isCustom && (
 <button
 className="btn btn-secondary settings-card-action focus:outline-none"
 onClick={() => handleDeleteCustomDirectory(platform.id)}
 title="删除自定义目录"
 >
 <Trash2 size={14} />
 </button>
 )}

 <button
 className="btn btn-secondary settings-card-action focus:outline-none"
 onClick={() => handleSelectPlatformDirectory(platform)}
 >
 更改
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
}
