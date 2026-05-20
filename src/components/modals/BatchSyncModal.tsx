import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, CheckSquare, Square, ExternalLink, Cpu, Sparkles, Compass } from 'lucide-react';
import { ALL_PLATFORMS, DEFAULT_ENABLED_PLATFORMS } from '../../config/platforms';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

const GithubIconSvg = ({ size = 18, style = {} }: { size?: number, style?: React.CSSProperties }) => (
  <svg 
    height={size} 
    width={size} 
    viewBox="0 0 16 16" 
    fill="currentColor"
    style={{ display: 'inline-block', verticalAlign: 'text-bottom', ...style }}
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

interface BatchSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSkillNames: string[];
  onSyncComplete?: () => void;
}

export function BatchSyncModal({ isOpen, onClose, selectedSkillNames, onSyncComplete }: BatchSyncModalProps) {
  const navigate = useNavigate();
  const [enabledPlatformIds, setEnabledPlatformIds] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (isOpen) {
      let platformIds = DEFAULT_ENABLED_PLATFORMS;
      try {
        const stored = localStorage.getItem('skillhub-platforms-config');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.enabledPlatforms)) {
            platformIds = parsed.enabledPlatforms;
          }
        }
      } catch (e) {
        console.error(e);
      }
      setEnabledPlatformIds(platformIds);
      setSelectedPlatforms(new Set(platformIds));
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const syncPlatforms = ALL_PLATFORMS.filter(p => enabledPlatformIds.includes(p.id));
  const isAllSelected = syncPlatforms.length > 0 && selectedPlatforms.size === syncPlatforms.length;

  const handleTogglePlatform = (platformId: string) => {
    const next = new Set(selectedPlatforms);
    if (next.has(platformId)) {
      next.delete(platformId);
    } else {
      next.add(platformId);
    }
    setSelectedPlatforms(next);
  };

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedPlatforms(new Set());
    } else {
      setSelectedPlatforms(new Set(syncPlatforms.map(p => p.id)));
    }
  };

  const getPlatformFallbackIcon = (id: string) => {
    if (id === 'vscode-copilot') return <GithubIconSvg size={20} style={{ color: 'var(--text-main)' }} />;
    if (id === 'cursor') return <Cpu size={20} style={{ color: '#00c3b6' }} />;
    if (id === 'gemini') return <Sparkles size={20} style={{ color: '#4f46e5' }} />;
    if (id === 'trae') return <Sparkles size={20} style={{ color: '#3b82f6' }} />;
    if (id === 'antigravity') return <Compass size={20} className="text-primary" style={{ color: 'var(--color-primary)' }} />;
    return <Cpu size={20} />;
  };

  const getDisplaySubId = (id: string) => {
    if (id === 'vscode-copilot') return 'copilot';
    return id;
  };

  const handleGoToSettings = (e: React.MouseEvent, platformId: string) => {
    e.stopPropagation();
    // 写入一个标识，以便 Settings.tsx 在加载时自动激活 Tab
    localStorage.setItem('skillhub-settings-active-tab', 'skill');
    onClose();
    navigate('/settings');
  };

  const handleStartSync = async () => {
    if (selectedPlatforms.size === 0 || selectedSkillNames.length === 0) return;

    let platformSettings = { enabledPlatforms: [] as string[], customPaths: {} as Record<string, string> };
    try {
      const stored = localStorage.getItem('skillhub-platforms-config');
      if (stored) {
        platformSettings = JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }

    // 拼装选中的平台配置目标
    const targets = Array.from(selectedPlatforms).map(id => {
      const customPath = platformSettings.customPaths[id];
      const defaultPath = ALL_PLATFORMS.find(p => p.id === id)?.defaultPath || '';
      return {
        platform_id: id,
        target_path: customPath || defaultPath
      };
    }).filter(t => t.target_path);

    if (targets.length === 0) {
      alert('未检测到有效的同步路径，请先在设置中配置平台路径。');
      return;
    }

    try {
      setIsSyncing(true);
      setSyncProgress({ current: 0, total: selectedSkillNames.length });

      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }

      let successCount = 0;
      let errorList: string[] = [];

      for (let i = 0; i < selectedSkillNames.length; i++) {
        const skillName = selectedSkillNames[i];
        setSyncProgress({ current: i + 1, total: selectedSkillNames.length });
        
        try {
          await invoke('batch_install_skill', {
            dataPath,
            skillName,
            targets
          });
          successCount++;
        } catch (err) {
          errorList.push(`${skillName}: ${err}`);
        }
      }

      if (errorList.length === 0) {
        alert(`同步成功！已将 ${successCount} 个技能同步至选定的平台。`);
      } else {
        alert(`同步部分完成。成功: ${successCount}个，失败: ${errorList.length}个。\n详情: ${errorList.join('\n')}`);
      }

      if (onSyncComplete) onSyncComplete();
      onClose();
    } catch (err) {
      alert(`同步出错: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-container fade-in" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: 'none' }}>
          <div className="flex items-center justify-between w-full">
            <h3 className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>目标平台</h3>
            <div className="flex items-center gap-3">
              <span 
                className="badge-selected" 
                style={{ 
                  color: 'var(--color-primary)', 
                  backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                  borderRadius: '999px',
                  padding: '3px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: 600
                }}
              >
                已选 {selectedPlatforms.size} 个
              </span>
              <button 
                type="button" 
                className="btn-select-all-toggle"
                style={{ 
                  color: 'var(--color-primary)', 
                  fontSize: '0.875rem', 
                  fontWeight: 500, 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  outline: 'none',
                  padding: 0
                }}
                onClick={handleSelectAllToggle}
              >
                {isAllSelected ? '取消全选' : '全选'}
              </button>
            </div>
          </div>
          <button className="modal-close-btn" style={{ outline: 'none', position: 'absolute', right: '20px', top: '22px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '0 24px 20px 24px' }}>
          {/* Info bar */}
          <div 
            className="sync-info-bar" 
            style={{ 
              backgroundColor: 'var(--color-bg-app)', 
              border: '1px solid var(--color-border)', 
              borderRadius: '8px', 
              padding: '12px 16px', 
              marginBottom: '16px', 
              fontSize: '0.8125rem', 
              color: 'var(--color-text-secondary)',
              textAlign: 'left'
            }}
          >
            默认已选中当前检测到的平台。开始批量同步前请先确认目标平台。
          </div>

          {/* Grid platforms */}
          {syncPlatforms.length === 0 ? (
            <div 
              style={{ 
                textAlign: 'center', 
                padding: '40px 20px', 
                color: 'var(--color-text-secondary)',
                backgroundColor: 'var(--color-bg-app)',
                border: '1px dashed var(--color-border)',
                borderRadius: '12px',
                marginBottom: '20px'
              }}
            >
              <div style={{ fontSize: '0.9375rem', marginBottom: '12px' }}>未检测到已启用的平台集成</div>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ outline: 'none', padding: '6px 16px', fontSize: '0.8125rem' }}
                onClick={(e) => handleGoToSettings(e, '')}
              >
                前往设置-Skill启用平台
              </button>
            </div>
          ) : (
            <div 
              className="sync-platforms-grid" 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                marginBottom: '20px'
              }}
            >
              {syncPlatforms.map(platform => {
                const isSelected = selectedPlatforms.has(platform.id);
                return (
                  <div 
                    key={platform.id}
                    className={`sync-platform-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleTogglePlatform(platform.id)}
                    style={{
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.02)' : 'var(--color-bg-surface)',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : 'none'
                    }}
                  >
                    <div className="flex items-center" style={{ minWidth: 0, flex: 1 }}>
                      {/* Platform icon container */}
                      <div 
                        className="platform-icon-wrapper" 
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '10px', 
                          backgroundColor: 'var(--color-bg-app)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          marginRight: '12px',
                          flexShrink: 0,
                          border: '1px solid var(--color-border)'
                        }}
                      >
                        <img 
                          src={platform.icon} 
                          alt="" 
                          style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              const fallback = parent.querySelector('.platform-fallback-icon');
                              if (fallback) fallback.setAttribute('style', 'display: flex');
                            }
                          }}
                        />
                        <div className="platform-fallback-icon" style={{ display: 'none', alignItems: 'center', justifyContent: 'center' }}>
                          {getPlatformFallbackIcon(platform.id)}
                        </div>
                      </div>

                      {/* Title */}
                      <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{platform.name}</span>
                          <button
                            type="button"
                            className="btn-configure-platform"
                            title="配置路径"
                            onClick={(e) => handleGoToSettings(e, platform.id)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              cursor: 'pointer', 
                              padding: '2px', 
                              display: 'flex', 
                              alignItems: 'center',
                              color: 'var(--color-primary)',
                              opacity: 0.6,
                              outline: 'none'
                            }}
                          >
                            <ExternalLink size={12} />
                          </button>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {getDisplaySubId(platform.id)}
                        </div>
                      </div>
                    </div>

                    {/* Checkbox */}
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
                      {isSelected ? (
                        <CheckSquare size={18} className="text-primary" style={{ color: 'var(--color-primary)' }} />
                      ) : (
                        <Square size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--color-border)' }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ 
              outline: 'none', 
              padding: '8px 24px', 
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500
            }} 
            disabled={isSyncing}
            onClick={onClose}
          >
            取消
          </button>
          <button 
            type="button"
            className="btn btn-primary" 
            style={{ 
              outline: 'none', 
              padding: '8px 24px', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
              backgroundColor: selectedPlatforms.size === 0 || isSyncing ? 'var(--color-border)' : 'var(--color-primary)',
              cursor: selectedPlatforms.size === 0 || isSyncing ? 'not-allowed' : 'pointer'
            }} 
            disabled={selectedPlatforms.size === 0 || isSyncing}
            onClick={handleStartSync}
          >
            <Send size={15} />
            <span>{isSyncing ? `同步中 (${syncProgress.current}/${syncProgress.total})...` : '批量同步到平台'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
