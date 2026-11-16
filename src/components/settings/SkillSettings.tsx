import { useState, useEffect } from 'react';
import { Sparkles, Folder, Plus, Trash2, Server, X } from 'lucide-react';
import { ask, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
 DEFAULT_USER_SETTINGS,
 formatRemoteTarget,
 getAllPlatforms,
 normalizeUserPlatformSettings,
 type PlatformConfig,
 type RemoteConfig,
 type UserPlatformSettings
} from '../../config/platforms';
import { RemoteDirectoryModal } from './RemoteDirectoryModal';

export function SkillSettings() {
 const [settings, setSettings] = useState<UserPlatformSettings>(DEFAULT_USER_SETTINGS);
 const [remoteModalOpen, setRemoteModalOpen] = useState(false);
 const [editingRemote, setEditingRemote] = useState<PlatformConfig | null>(null);
 const [customDirModalOpen, setCustomDirModalOpen] = useState(false);
 const [customDirName, setCustomDirName] = useState('');

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
 // 通知侧边栏等处刷新远程目录子菜单
 window.dispatchEvent(new CustomEvent('platforms-updated'));
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

 const handleAddCustomDirectory = () => {
 setCustomDirName('');
 setCustomDirModalOpen(true);
 };

 const handleConfirmCustomDirectory = async () => {
 const trimmedName = customDirName.trim();
 if (!trimmedName) return;
 setCustomDirModalOpen(false);

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

 const handleDeleteCustomDirectory = async (id: string) => {
 const confirmed = await ask('确定删除该自定义目录吗？', {
 title: 'SkillsHub',
 kind: 'warning',
 okLabel: '删除',
 cancelLabel: '取消'
 }).catch(() => window.confirm('确定删除该自定义目录吗？'));
 if (!confirmed) return;

 // 远程目录：顺带清理系统凭据管理器中保存的密码（尽力而为）
 const removed = settings.customPlatforms.find(p => p.id === id);
 if (removed?.remote?.authMethod === 'password') {
 const { host, port, username } = removed.remote;
 invoke('delete_ssh_password', { host, port, username }).catch(e => console.error(e));
 }

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

 const handleSaveRemoteDirectory = (name: string, remote: RemoteConfig) => {
 if (editingRemote) {
 const editingId = editingRemote.id;
 updateSettings(prev => ({
 ...prev,
 customPaths: { ...prev.customPaths, [editingId]: remote.remotePath },
 customPlatforms: prev.customPlatforms.map(item => (
 item.id === editingId
 ? { ...item, name, defaultPath: remote.remotePath, remote }
 : item
 ))
 }));
 } else {
 const id = `remote-directory-${Date.now()}`;
 const remotePlatform: PlatformConfig = {
 id,
 name,
 icon: '',
 defaultPath: remote.remotePath,
 isCustom: true,
 remote
 };
 updateSettings(prev => ({
 ...prev,
 enabledPlatforms: [...prev.enabledPlatforms, id],
 customPaths: { ...prev.customPaths, [id]: remote.remotePath },
 customPlatforms: [...prev.customPlatforms, remotePlatform]
 }));
 }
 setEditingRemote(null);
 };

 const handleSelectPlatformDirectory = async (platform: PlatformConfig) => {
 // 远程目录改用弹窗编辑
 if (platform.remote) {
 setEditingRemote(platform);
 setRemoteModalOpen(true);
 return;
 }

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
 if (platform.remote) {
 return <Server size={size} className="text-primary" />;
 }
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
 <div className="flex items-center gap-2">
 <button
 className="btn btn-secondary focus:outline-none"
 onClick={handleAddCustomDirectory}
 >
 <Plus size={16} className="mr-1 inline" />
 添加自定义目录
 </button>
 <button
 className="btn btn-secondary focus:outline-none"
 onClick={() => { setEditingRemote(null); setRemoteModalOpen(true); }}
 >
 <Server size={16} className="mr-1 inline" />
 添加远程目录
 </button>
 </div>
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
 {platform.remote
 ? <Server size={20} className="text-primary" />
 : <Folder size={20} className="text-secondary" />}
 </div>

 <div className="settings-card-info" style={{ flex:1, minWidth:0 }}>
 <div className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
 <span>{platform.remote ? '远程路径 (SSH)' : '存放路径'}</span>
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
 {platform.remote
 ? formatRemoteTarget(platform.remote)
 : (customPath || platform.defaultPath || '未配置')}
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

 <RemoteDirectoryModal
 isOpen={remoteModalOpen}
 onClose={() => { setRemoteModalOpen(false); setEditingRemote(null); }}
 initialName={editingRemote?.name}
 initialRemote={editingRemote?.remote}
 onSave={handleSaveRemoteDirectory}
 />

 {customDirModalOpen && (
 <div className="modal-overlay active" onClick={() => setCustomDirModalOpen(false)}>
 <div
 className="modal-container fade-in"
 style={{ maxWidth: '440px' }}
 onClick={e => e.stopPropagation()}
 >
 <div className="modal-header" style={{ padding: '20px 24px' }}>
 <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <Folder size={18} className="text-secondary" />
 添加自定义目录
 </h3>
 <button
 className="modal-close-btn"
 style={{ outline: 'none', position: 'absolute', right: '20px', top: '22px' }}
 onClick={() => setCustomDirModalOpen(false)}
 >
 <X size={18} />
 </button>
 </div>

 <div className="modal-body" style={{ padding: '0 24px 8px 24px' }}>
 <label className="form-label" style={{ marginTop: '0.5rem' }}>目录名称</label>
 <input
 type="text"
 className="form-input"
 placeholder="例如：Obsidian、备份目录"
 value={customDirName}
 onChange={e => setCustomDirName(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') handleConfirmCustomDirectory(); }}
 autoFocus
 />
 <p className="form-helper">点击「下一步」后选择该目录的本地存放路径</p>
 </div>

 <div className="modal-footer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--color-border)' }}>
 <button
 type="button"
 className="btn btn-secondary focus:outline-none"
 onClick={() => setCustomDirModalOpen(false)}
 >
 取消
 </button>
 <button
 type="button"
 className="btn btn-primary focus:outline-none"
 disabled={!customDirName.trim()}
 onClick={handleConfirmCustomDirectory}
 >
 下一步：选择目录
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
