import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Settings as SettingsIcon, Monitor, Database, 
  Cpu, Sparkles, Keyboard, Globe, Bell, Key, Info, 
  Folder, ExternalLink
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { appDataDir, join } from '@tauri-apps/api/path';

const SETTINGS_TABS = [
  { id: 'general', name: '常规设置', icon: SettingsIcon },
  { id: 'display', name: '显示设置', icon: Monitor },
  { id: 'data', name: '数据设置', icon: Database },
  { id: 'ai', name: 'AI 模型', icon: Cpu },
  { id: 'skill', name: 'Skill', icon: Sparkles },
  { id: 'shortcuts', name: '快捷键', icon: Keyboard },
  { id: 'language', name: '语言', icon: Globe },
  { id: 'notifications', name: '通知', icon: Bell },
  { id: 'security', name: '安全', icon: Key },
  { id: 'about', name: '关于', icon: Info },
];

export function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('data');
  const [dataPath, setDataPath] = useState('');

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
        
        {activeTab !== 'data' && (
          <div className="settings-section empty-section flex items-center justify-center">
            <p className="text-secondary">该设置页面正在开发中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
