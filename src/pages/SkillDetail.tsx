import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { 
  ArrowLeft, ShieldCheck, Globe, CheckSquare, Download, LayoutGrid
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AITranslationModal } from '../components/modals/AITranslationModal';
import { ALL_PLATFORMS, DEFAULT_USER_SETTINGS, type UserPlatformSettings } from '../config/platforms';

export function SkillDetail() {
  const { skillName } = useParams();
  const navigate = useNavigate();
  
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState<string>('');
  
  const [platformSettings, setPlatformSettings] = useState<UserPlatformSettings>(DEFAULT_USER_SETTINGS);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [showTranslate, setShowTranslate] = useState(false);
  const [copiedMD, setCopiedMD] = useState(false);
  const [installing, setInstalling] = useState(false);

  const displayPlatforms = useMemo(() => {
    return ALL_PLATFORMS.filter(p => platformSettings.enabledPlatforms.includes(p.id));
  }, [platformSettings]);

  const filteredContent = useMemo(() => {
    return content.split('\n').filter(line => {
      const trimmed = line.trim().toLowerCase();
      return !trimmed.startsWith('name:') && 
             !trimmed.startsWith('description:') && 
             !trimmed.startsWith('description：') &&
             trimmed !== '---';
    }).join('\n').trim();
  }, [content]);

  const handleCopyMD = () => {
    navigator.clipboard.writeText(filteredContent);
    setCopiedMD(true);
    setTimeout(() => setCopiedMD(false), 2000);
  };

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        let dataPath = localStorage.getItem('skillhub-data-path');
        if (!dataPath) {
          const baseDir = await appDataDir();
          dataPath = await join(baseDir, 'SkillsHub');
        }
        
        const result: string = await invoke('get_skill_detail', { dataPath, skillName });
        setContent(result);
        
        // Extract description (just basic parsing for now)
        let foundDesc = '';
        const lines = result.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.toLowerCase().startsWith('description:')) {
            foundDesc = trimmedLine.substring(12).trim();
            break;
          } else if (trimmedLine.toLowerCase().startsWith('description：')) { // handle chinese colon
            foundDesc = trimmedLine.substring(12).trim();
            break;
          }
        }
        
        // Fallback to first non-title line if no description: field
        if (!foundDesc) {
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
              foundDesc = trimmedLine;
              break;
            }
          }
        }
        setDescription(foundDesc);
        
      } catch (error) {
        console.error('Failed to fetch skill detail:', error);
      } finally {
        setLoading(false);
      }
    };
    
    const loadSettings = () => {
      try {
        const stored = localStorage.getItem('skillhub-platforms-config');
        if (stored) {
          setPlatformSettings(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to parse platform settings', e);
      }
    };
    
    if (skillName) {
      fetchDetail();
      loadSettings();
    }
  }, [skillName]);

  const togglePlatform = (id: string) => {
    const newSet = new Set(selectedPlatforms);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPlatforms(newSet);
  };

  const toggleAll = () => {
    if (selectedPlatforms.size === displayPlatforms.length) {
      setSelectedPlatforms(new Set());
    } else {
      setSelectedPlatforms(new Set(displayPlatforms.map(p => p.id)));
    }
  };

  const handleBatchInstall = async () => {
    if (!skillName || selectedPlatforms.size === 0) return;
    
    try {
      setInstalling(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }

      // Collect target paths for selected platforms
      const targets = Array.from(selectedPlatforms).map(id => {
        const customPath = platformSettings.customPaths[id];
        const defaultPath = ALL_PLATFORMS.find(p => p.id === id)?.defaultPath || '';
        return {
          platform_id: id,
          target_path: customPath || defaultPath
        };
      }).filter(t => t.target_path); // filter out empty paths
      
      const result = await invoke('batch_install_skill', {
        dataPath,
        skillName,
        targets
      });
      
      alert(`安装成功:\n${result}`);
      
    } catch (error) {
      console.error('Failed to batch install:', error);
      alert(`安装失败: ${error}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="page-container skill-detail-page flex flex-col h-full">
      {/* Header */}
      <div className="skill-detail-header shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button className="skill-action-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
            <div className="skill-card-icon" style={{ marginBottom: 0, width: 40, height: 40 }}>
              {skillName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-h2 text-primary">{skillName}</h1>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            <div className="tab-item" style={{ borderBottom: 'none', color: 'var(--color-primary)' }}>
              <span className="flex items-center gap-2"><LayoutGrid size={16} /> 预览</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden mt-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-secondary">加载中...</div>
        ) : (
          <div className="skill-detail-layout h-full">
            {/* Left Column: Preview */}
            <div className="preview-section flex flex-col gap-6 overflow-y-auto pr-4 pb-8">
              <div>
                <h3 className="text-sm font-medium text-secondary mb-3">技能描述</h3>
                <div className="info-box bg-surface text-main markdown-body">
                  <p>{description}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-secondary">技能内容</h3>
                  <div className="flex items-center gap-2">
                    <button 
                      className="skill-action-btn text-sm flex items-center gap-1 px-2 w-auto h-auto"
                      onClick={() => setShowTranslate(true)}
                    >
                      <Globe size={14}/> AI 翻译
                    </button>
                    <button 
                      className={`skill-action-btn text-sm flex items-center gap-1 px-2 w-auto h-auto ${copiedMD ? 'text-primary' : ''}`}
                      onClick={handleCopyMD}
                    >
                      {copiedMD ? <ShieldCheck size={14}/> : <CheckSquare size={14}/>}
                      {copiedMD ? '已复制' : '复制 MD'}
                    </button>
                  </div>
                </div>
                <div className="info-box bg-surface markdown-body">
                  <ReactMarkdown>{filteredContent}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Right Column: Platform Integration */}
            <div className="integration-section border-l border-border pl-6 overflow-y-auto pb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-secondary">平台集成</h3>
                <span className="text-xs font-mono text-tertiary">SKILL.MD</span>
              </div>
              
              <div className="info-box bg-surface">
                <p className="text-xs text-secondary mb-6 leading-relaxed">
                  复制：将 SKILL.md 等相关文件复制到每个平台设定的技能目录中。各副本独立互不影响，在 SkillHub 中编辑后不会自动同步。如需修改第三方平台的默认路径，请在「设置 - Skill」中进行配置。
                </p>

                <div className="flex items-center justify-between mb-4 px-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="accent-primary"
                      checked={displayPlatforms.length > 0 && selectedPlatforms.size === displayPlatforms.length}
                      onChange={toggleAll}
                    /> 
                    全选
                  </label>
                  <button 
                    className={`btn btn-primary px-6 py-1.5 text-sm ${selectedPlatforms.size === 0 || installing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleBatchInstall}
                    disabled={selectedPlatforms.size === 0 || installing}
                  >
                    <Download size={14} className="mr-1 inline" /> {installing ? '安装中...' : '批量安装'}
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  {displayPlatforms.map((platform) => (
                    <div 
                      key={platform.id} 
                      className="integration-item flex items-center justify-between p-3 border border-border rounded-lg cursor-pointer hover:bg-app transition-colors"
                      onClick={() => togglePlatform(platform.id)}
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={platform.icon} 
                          alt={platform.name} 
                          style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px' }}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-main">{platform.name}</span>
                          <span className="text-xs text-tertiary">
                            {platformSettings.customPaths[platform.id] || platform.defaultPath || '未设置路径'}
                          </span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" 
                        className="accent-primary w-4 h-4"
                        checked={selectedPlatforms.has(platform.id)}
                        readOnly
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Translation Modal */}
      <AITranslationModal 
        isOpen={showTranslate}
        onClose={() => setShowTranslate(false)}
        sourceContent={filteredContent}
      />
    </div>
  );
}
