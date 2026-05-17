import { useState, useEffect } from 'react';
import { Sparkles, Folder } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { 
  ALL_PLATFORMS, 
  DEFAULT_USER_SETTINGS, 
  type UserPlatformSettings 
} from '../../config/platforms';

export function SkillSettings() {
  const [settings, setSettings] = useState<UserPlatformSettings>(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('skillhub-platforms-config');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse platform settings', e);
    }
  }, []);

  const updateSettings = (updater: (prev: UserPlatformSettings) => UserPlatformSettings) => {
    setSettings(prev => {
      const next = updater(prev);
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

  const handleSelectPlatformDirectory = async (id: string) => {
    try {
      const platformName = ALL_PLATFORMS.find(p => p.id === id)?.name || '';
      const selected = await open({
        directory: true,
        multiple: false,
        title: `选择 ${platformName} 存放路径`,
      });
      
      if (selected && typeof selected === 'string') {
        handlePathChange(id, selected);
      }
    } catch (err) {
      console.error('Failed to open directory dialog', err);
    }
  };

  return (
    <div className="settings-section fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="settings-title mb-0 flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          Skill 存放目录
        </h2>
      </div>

      <div className="flex flex-col gap-6">
        {ALL_PLATFORMS.map(platform => {
          const isEnabled = settings.enabledPlatforms.includes(platform.id);
          const customPath = settings.customPaths[platform.id] || '';

          return (
            <div key={platform.id} className="settings-group">
              <h3 className="settings-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img 
                  src={platform.icon} 
                  alt={platform.name} 
                  style={{ width: '20px', height: '20px', objectFit: 'contain', borderRadius: '3px' }}
                />
                {platform.name}
              </h3>
              
              <div className="settings-card">
                <div className="settings-card-icon">
                  <Folder size={20} className="text-secondary" />
                </div>
                
                <div className="settings-card-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>存放路径</span>
                    <label className="cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                      <input 
                        type="checkbox" 
                        className="accent-primary"
                        style={{ width: '14px', height: '14px', margin: 0 }}
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
                
                <button 
                  className="btn btn-secondary settings-card-action focus:outline-none" 
                  onClick={() => handleSelectPlatformDirectory(platform.id)}
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

