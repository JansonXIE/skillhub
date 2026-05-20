import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Database, Cpu, Sparkles, Info, 
  Folder, ExternalLink, UploadCloud, Mail
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { appDataDir, join } from '@tauri-apps/api/path';
import { AIModelSettings } from '../components/settings/AIModelSettings';
import { SkillSettings } from '../components/settings/SkillSettings';
import { RepoSettings } from '../components/settings/RepoSettings';

const GithubIconSvg = ({ size = 18 }: { size?: number }) => (
  <svg 
    height={size} 
    width={size} 
    viewBox="0 0 16 16" 
    fill="currentColor"
    style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const SETTINGS_TABS = [
  { id: 'data', name: '数据设置', icon: Database },
  { id: 'ai', name: 'AI 模型', icon: Cpu },
  { id: 'skill', name: 'Skill', icon: Sparkles },
  { id: 'repo', name: 'skill 仓库', icon: UploadCloud },
  { id: 'about', name: '关于', icon: Info },
];

export function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('data');
  const [dataPath, setDataPath] = useState('');
  const [autoCheckUpdate, setAutoCheckUpdate] = useState<boolean>(() => {
    return localStorage.getItem('skillhub-auto-check-update') !== 'false';
  });

  const handleToggleAutoCheckUpdate = (checked: boolean) => {
    setAutoCheckUpdate(checked);
    localStorage.setItem('skillhub-auto-check-update', checked ? 'true' : 'false');
  };

  const handleOpenExternalUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      console.error('Failed to open link:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  useEffect(() => {
    const initPath = async () => {
      try {
        const savedPath = localStorage.getItem('skillhub-data-path');
        if (savedPath) {
          setDataPath(savedPath);
        } else {
          const baseDir = await appDataDir();
          const defaultPath = await join(baseDir, 'SkillsHub');
          setDataPath(defaultPath);
        }
      } catch (err) {
        console.error('Failed to initialize data path', err);
      }
    };
    initPath();

    // Check if redirecting from BatchSyncModal to configure skills
    const overrideTab = localStorage.getItem('skillhub-settings-active-tab');
    if (overrideTab) {
      setActiveTab(overrideTab);
      localStorage.removeItem('skillhub-settings-active-tab');
    }
  }, []);

  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择数据目录',
      });
      
      if (selected && typeof selected === 'string') {
        setDataPath(selected);
        localStorage.setItem('skillhub-data-path', selected);
        window.dispatchEvent(new CustomEvent('skills-updated'));
      }
    } catch (err) {
      console.error('Failed to open directory dialog', err);
    }
  };

  const openInExplorer = () => {
    // We could use tauri-plugin-shell to open the path in explorer
    // But for this UI mockup, it's just visual.
  };

  return (
    <div className="settings-page">
      <div className="settings-sidebar-nav">
        <button className="settings-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>返回</span>
        </button>
        
        <div className="settings-tabs">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="settings-content-area">
        {activeTab === 'data' && (
          <div className="settings-section fade-in">
            <h2 className="settings-title">数据设置</h2>
            
            <div className="settings-group">
              <h3 className="settings-subtitle">数据目录</h3>
              
              <div className="settings-card">
                <div className="settings-card-icon">
                  <Folder size={20} className="text-secondary" />
                </div>
                
                <div className="settings-card-info">
                  <div className="settings-card-title">数据目录</div>
                  <div className="settings-card-desc flex items-center gap-1 cursor-pointer" onClick={openInExplorer}>
                    {dataPath}
                    <ExternalLink size={12} className="text-primary hover-text-primary-dark" />
                  </div>
                </div>
                
                <button className="btn btn-secondary settings-card-action" onClick={handleSelectDirectory}>
                  更改
                </button>
              </div>
            </div>
            
            {/* The rest of the features from the image were requested to be excluded */}
          </div>
        )}
        
        {activeTab === 'ai' && (
          <AIModelSettings />
        )}

        {activeTab === 'skill' && (
          <SkillSettings />
        )}

        {activeTab === 'repo' && (
          <RepoSettings />
        )}

        {activeTab === 'about' && (
          <div className="settings-section fade-in">
            <h2 className="settings-title">关于</h2>
            
            <div className="settings-group">
              <h3 className="settings-subtitle">检查更新</h3>
              <div className="settings-card flex justify-between items-center" style={{ padding: '1.25rem 1.5rem' }}>
                <div className="settings-card-info">
                  <div className="settings-card-title">自动检查更新</div>
                  <div className="settings-card-desc" style={{ color: 'var(--text-secondary)' }}>
                    启动时自动检查新版本
                  </div>
                </div>
                <label className="settings-switch-label">
                  <input
                    type="checkbox"
                    checked={autoCheckUpdate}
                    onChange={(e) => handleToggleAutoCheckUpdate(e.target.checked)}
                  />
                  <span className="settings-switch-slider"></span>
                </label>
              </div>
            </div>
            
            <div className="settings-group">
              <h3 className="settings-subtitle">作者信息</h3>
              <div className="settings-card" style={{ display: 'block', padding: '0.5rem 0' }}>
                <div className="about-card-list">
                  <button 
                    type="button"
                    className="about-item flex items-center bg-transparent border-0 cursor-pointer focus:outline-none" 
                    onClick={() => handleOpenExternalUrl('https://github.com/JansonXIE')}
                    style={{ padding: '0.75rem 1.5rem' }}
                  >
                    <div className="about-item-icon github-bg">
                      <GithubIconSvg size={18} />
                    </div>
                    <div className="about-item-info">
                      <div className="about-item-title">@JansonXIE</div>
                      <div className="about-item-subtitle">GitHub</div>
                    </div>
                  </button>
                  
                  <div className="about-item-divider" />
                  
                  <button 
                    type="button"
                    className="about-item flex items-center bg-transparent border-0 cursor-pointer focus:outline-none" 
                    onClick={() => handleOpenExternalUrl('mailto:jianxing.xie@sophgo.com')}
                    style={{ padding: '0.75rem 1.5rem' }}
                  >
                    <div className="about-item-icon email-bg">
                      <Mail size={18} />
                    </div>
                    <div className="about-item-info">
                      <div className="about-item-title">jianxing.xie@sophgo.com</div>
                      <div className="about-item-subtitle">Email (有 Bug 或修改建议可以发邮件反馈)</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'data' && activeTab !== 'ai' && activeTab !== 'skill' && activeTab !== 'repo' && activeTab !== 'about' && (
          <div className="settings-section empty-section flex items-center justify-center">
            <p className="text-secondary">该设置页面正在开发中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
