import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { 
  ArrowLeft, Camera, Star, History, Edit, Trash2, 
  ShieldCheck, Globe, CheckSquare, Download, LayoutGrid, FolderInput
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface PlatformIntegration {
  id: string;
  name: string;
  icon: string; // we'll use an image or letter placeholder for now
}

const PLATFORMS: PlatformIntegration[] = [
  { id: 'github-copilot', name: 'GitHub Copilot', icon: 'Copilot' },
  { id: 'cursor', name: 'Cursor', icon: 'Cursor' },
  { id: 'gemini', name: 'Gemini CLI', icon: 'Gemini' },
  { id: 'antigravity', name: 'Antigravity', icon: 'Antigravity' },
];

export function SkillDetail() {
  const { skillName } = useParams();
  const navigate = useNavigate();
  
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState<string>('');
  
  const [installMode, setInstallMode] = useState<'copy' | 'symlink'>('copy');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());

  const filteredContent = useMemo(() => {
    return content.split('\n').filter(line => {
      const trimmed = line.trim().toLowerCase();
      return !trimmed.startsWith('name:') && 
             !trimmed.startsWith('description:') && 
             !trimmed.startsWith('description：') &&
             trimmed !== '---';
    }).join('\n').trim();
  }, [content]);

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
    
    if (skillName) {
      fetchDetail();
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
    if (selectedPlatforms.size === PLATFORMS.length) {
      setSelectedPlatforms(new Set());
    } else {
      setSelectedPlatforms(new Set(PLATFORMS.map(p => p.id)));
    }
  };

  const handleBatchInstall = () => {
    console.log(`Installing to ${selectedPlatforms.size} platforms using mode: ${installMode}`);
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
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-6">
            <div className="tab-item active">
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
                <div className="info-box bg-surface text-main">
                  <p>{description}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-secondary">技能内容</h3>
                  <div className="flex items-center gap-2">
                    <button className="skill-action-btn text-sm flex items-center gap-1 px-2 w-auto h-auto"><Globe size={14}/> AI 翻译</button>
                    <button className="skill-action-btn text-sm flex items-center gap-1 px-2 w-auto h-auto"><CheckSquare size={14}/> 复制 MD</button>
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
                {/* Segmented Control */}
                <div className="segment-control mb-4">
                  <div 
                    className={`segment-item flex-1 justify-center ${installMode === 'copy' ? 'active bg-primary text-white' : ''}`}
                    onClick={() => setInstallMode('copy')}
                  >
                    <Download size={14} /> 复制
                  </div>
                  <div 
                    className={`segment-item flex-1 justify-center ${installMode === 'symlink' ? 'active bg-primary text-white' : ''}`}
                    onClick={() => setInstallMode('symlink')}
                  >
                    <Globe size={14} /> 软链接
                  </div>
                </div>

                <p className="text-xs text-secondary mb-6 leading-relaxed">
                  {installMode === 'copy' 
                    ? '复制：将 SKILL.md 文件复制到每个平台目录。各副本独立互不影响，在 PromptHub 中编辑后不会自动同步。'
                    : '软链接：在目标目录创建指向此 SKILL.md 的链接。任何修改都会实时同步。'}
                </p>

                <div className="flex items-center justify-between mb-4 px-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="accent-primary"
                      checked={selectedPlatforms.size === PLATFORMS.length}
                      onChange={toggleAll}
                    /> 
                    全选
                  </label>
                  <button 
                    className={`btn btn-primary px-6 py-1.5 text-sm ${selectedPlatforms.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleBatchInstall}
                    disabled={selectedPlatforms.size === 0}
                  >
                    <Download size={14} className="mr-1 inline" /> 批量安装
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  {PLATFORMS.map((platform) => (
                    <div 
                      key={platform.id} 
                      className="integration-item flex items-center justify-between p-3 border border-border rounded-lg cursor-pointer hover:bg-app transition-colors"
                      onClick={() => togglePlatform(platform.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-app rounded flex items-center justify-center text-xs font-bold border border-border">
                          {platform.icon.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-main">{platform.name}</span>
                          <span className="text-xs text-tertiary">点击选择</span>
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
    </div>
  );
}
