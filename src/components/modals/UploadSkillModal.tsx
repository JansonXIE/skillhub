import { useState, useEffect } from 'react';
import { X, UploadCloud, Check, GitBranch, Server } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface RepoConfig {
  id: string;
  name: string;
  url: string;
  branch: string;
  type: 'github' | 'gerrit';
  sshUser?: string;
}

interface UploadSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
}

export function UploadSkillModal({ isOpen, onClose, skillName }: UploadSkillModalProps) {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [amend, setAmend] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('skillhub-repos');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setRepos(parsed);
          if (parsed.length > 0) {
            setSelectedRepoId(parsed[0].id);
          }
        } catch (e) {
          console.error('Failed to parse repos', e);
        }
      }
      setError(null);
      setAmend(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedRepo = repos.find(r => r.id === selectedRepoId);
  const isGerrit = selectedRepo?.type === 'gerrit';

  // Generate Gerrit-format commit message via AI
  const generateGerritCommitMsg = async (diffText: string, skillName: string): Promise<string> => {
    const defaultMsg =
      `[chore](skill): 新增或更新 ${skillName} skill\n` +
      `[description ]: 新增或更新 ${skillName} skill\n` +
      `[root   cause]: NA\n` +
      `[JIRA      ID]: NA\n` +
      `[chip project]: NA\n` +
      `[side effects]: NA\n` +
      `[Affected *.ko/*.so/*.a] : NA`;

    try {
      const storedEndpoints = localStorage.getItem('skillhub-ai-endpoints');
      if (!storedEndpoints) return defaultMsg;

      const endpoints: any[] = JSON.parse(storedEndpoints);
      let aiEndpoint = null;
      let aiModel = null;

      for (const ep of endpoints) {
        if (ep.apiKey && ep.apiUrl && ep.models?.length > 0) {
          const model = ep.models.find((m: any) => m.isDefault) || ep.models[0];
          if (model) { aiEndpoint = ep; aiModel = model; break; }
        }
      }

      if (!aiEndpoint || !aiModel) return defaultMsg;

      const prompt =
        `请根据以下 git diff 差异，严格按照下方模板生成一条多行 git commit 提交信息。\n` +
        `规则：\n` +
        `  - [type] 从 feat|fix|docs|style|refactor|perf|test|chore|revert 中选一个\n` +
        `  - (scope) 英文小写，描述本次修改的模块范围\n` +
        `  - description 用简短中文描述，不超过30字\n` +
        `  - 其余字段保留 NA，只输出模板内容本身，不要有任何额外解释\n\n` +
        `输出模板（严格7行）：\n` +
        `[type](scope): description\n` +
        `[description ]: <AI填写>\n` +
        `[root   cause]: NA\n` +
        `[JIRA      ID]: NA\n` +
        `[chip project]: NA\n` +
        `[side effects]: NA\n` +
        `[Affected *.ko/*.so/*.a] : NA\n\n` +
        `git diff：\n${diffText.slice(0, 3000)}`;

      const url = aiEndpoint.apiUrl.endsWith('/chat/completions')
        ? aiEndpoint.apiUrl
        : `${aiEndpoint.apiUrl.replace(/\/$/, '')}/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiEndpoint.apiKey}` },
        body: JSON.stringify({
          model: aiModel.name,
          messages: [
            { role: 'system', content: '你是资深的底层BSP与系统开发工程师，熟悉Git提交规范和Conventional Commits规范。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 300
        })
      });

      if (response.ok) {
        const data = await response.json();
        const msg = data.choices?.[0]?.message?.content?.trim();
        if (msg) return msg.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      }
    } catch (e) {
      console.warn('Gerrit AI commit 生成失败:', e);
    }
    return defaultMsg;
  };

  // Generate GitHub-format commit message via AI
  const generateGithubCommitMsg = async (diffText: string, skillName: string): Promise<string> => {
    let commitMessage = `Update skill: ${skillName}`;
    try {
      const storedEndpoints = localStorage.getItem('skillhub-ai-endpoints');
      if (!storedEndpoints) return commitMessage;
      const endpoints: any[] = JSON.parse(storedEndpoints);
      let aiEndpoint = null;
      let aiModel = null;
      for (const ep of endpoints) {
        if (ep.apiKey && ep.apiUrl && ep.models?.length > 0) {
          const model = ep.models.find((m: any) => m.isDefault) || ep.models[0];
          if (model) { aiEndpoint = ep; aiModel = model; break; }
        }
      }
      if (!aiEndpoint || !aiModel) return commitMessage;

      const prompt = `请根据以下 git diff 差异，生成一句简短、专业、一目了然的中文 git commit 提交信息。只需返回提交信息本身，不要包含引号、markdown 标记或任何其他解释性文本。\n\n${diffText.slice(0, 3000)}`;
      const url = aiEndpoint.apiUrl.endsWith('/chat/completions')
        ? aiEndpoint.apiUrl
        : `${aiEndpoint.apiUrl.replace(/\/$/, '')}/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiEndpoint.apiKey}` },
        body: JSON.stringify({
          model: aiModel.name,
          messages: [
            { role: 'system', content: '你是资深的底层BSP与系统开发工程师，熟悉Git提交规范。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 50
        })
      });
      if (response.ok) {
        const data = await response.json();
        const generatedMsg = data.choices?.[0]?.message?.content?.trim();
        if (generatedMsg) commitMessage = generatedMsg.replace(/["'`\n]/g, '');
      }
    } catch (e) {
      console.warn('GitHub AI commit 生成失败:', e);
    }
    return commitMessage;
  };

  const handleUpload = async () => {
    if (!selectedRepoId) { setError('请选择要提交的仓库'); return; }
    const repo = repos.find(r => r.id === selectedRepoId);
    if (!repo) return;

    setError(null);

    try {
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }

      setIsUploading(true);

      if (repo.type === 'gerrit') {
        // ===== Gerrit 流程 =====
        setUploadStatus('正在准备 Gerrit 仓库并获取变更...');
        const diffText: string = await invoke('prepare_gerrit_commit', {
          dataPath,
          skillName,
          repoUrl: repo.url,
          branch: repo.branch,
          sshUser: repo.sshUser || '',
          amend,
        });

        if (!diffText || diffText.trim() === '') {
          if (!amend) {
            setError('没有发现任何文件修改，无需提交。');
            return;
          }
        }

        setUploadStatus('正在生成 Gerrit 格式 AI 提交信息...');
        const commitMessage = await generateGerritCommitMsg(diffText || '', skillName);

        setUploadStatus(`正在推送到 Gerrit Code Review (${commitMessage.split('\n')[0]})...`);
        await invoke('commit_and_push_to_gerrit', {
          repoUrl: repo.url,
          branch: repo.branch,
          commitMessage,
          amend,
        });

      } else {
        // ===== GitHub 流程 =====
        setUploadStatus('正在准备仓库并获取变更...');
        const diffText: string = await invoke('prepare_skill_commit', {
          dataPath,
          skillName,
          repoUrl: repo.url,
          branch: repo.branch,
        });

        if (!diffText || diffText.trim() === '') {
          setError('没有发现任何文件修改，无需提交。');
          return;
        }

        setUploadStatus('正在生成 AI 提交信息...');
        const commitMessage = await generateGithubCommitMsg(diffText, skillName);

        setUploadStatus(`正在推送到远程 (${commitMessage})...`);
        await invoke('commit_and_push_skill', {
          repoUrl: repo.url,
          branch: repo.branch,
          commitMessage,
        });
      }

      // Record as distributed
      const stored = localStorage.getItem('skillhub-distributed');
      let distributedList: any[] = [];
      if (stored) { try { distributedList = JSON.parse(stored); } catch (e) {} }
      distributedList.push({ name: skillName, repoId: repo.id, repoUrl: repo.url, timestamp: Date.now() });
      localStorage.setItem('skillhub-distributed', JSON.stringify(distributedList));
      window.dispatchEvent(new Event('distributed-updated'));

      onClose();
    } catch (err: any) {
      console.error('Failed to upload skill:', err);
      setError(err.toString());
    } finally {
      setIsUploading(false);
      setUploadStatus('');
    }
  };

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    },
    card: {
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '16px',
      padding: '32px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
      width: '100%',
      maxWidth: '800px',
      position: 'relative' as const,
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px',
    },
    title: {
      fontSize: '20px', fontWeight: '700', color: '#1e293b',
      display: 'flex', alignItems: 'center', gap: '8px',
    },
    closeBtn: {
      background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
      padding: '4px', borderRadius: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      outline: 'none', transition: 'all 0.15s ease',
    },
    row: { display: 'flex', alignItems: 'center', marginBottom: '20px' },
    label: { width: '120px', flexShrink: 0, fontSize: '15px', fontWeight: '500', color: '#1e293b' },
    valueText: {
      fontSize: '14px', fontWeight: '600', color: '#3b82f6',
      backgroundColor: '#eff6ff', padding: '6px 14px', borderRadius: '8px',
      whiteSpace: 'nowrap' as const,
    },
    selectWrapper: { flex: 1, position: 'relative' as const, display: 'flex', alignItems: 'center' },
    select: (isFocused: boolean) => ({
      flex: 1, height: '46px', borderRadius: '12px',
      border: isFocused ? '1.5px solid #3b82f6' : '1.5px solid #cbd5e1',
      padding: '0 36px 0 16px', fontSize: '14px', color: '#0f172a',
      backgroundColor: '#ffffff', outline: 'none', transition: 'all 0.15s ease',
      boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
      appearance: 'none' as const, cursor: 'pointer',
    }),
    selectArrow: { position: 'absolute' as const, right: '16px', color: '#64748b', pointerEvents: 'none' as const, fontSize: '12px' },
    statusText: { fontSize: '13px', color: '#64748b', marginTop: '12px', textAlign: 'right' as const },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' },
    btnCancel: {
      backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px',
      padding: '10px 20px', fontSize: '14px', fontWeight: '500',
      display: 'flex', alignItems: 'center', gap: '6px',
      cursor: 'pointer', transition: 'background-color 0.15s ease',
    },
    btnSubmit: (disabled: boolean) => ({
      backgroundColor: disabled ? '#93c5fd' : '#3b82f6',
      color: '#ffffff', border: 'none', borderRadius: '12px',
      padding: '10px 24px', fontSize: '14px', fontWeight: '500',
      display: 'flex', alignItems: 'center', gap: '6px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.15s ease',
      boxShadow: disabled ? 'none' : '0 2px 4px rgba(59, 130, 246, 0.1)',
    }),
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            <UploadCloud size={22} className="text-primary" />
            提交技能到远程仓库
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={styles.row}>
            <span style={styles.label}>当前技能</span>
            <span style={styles.valueText}>{skillName}</span>
          </div>

          {repos.length === 0 ? (
            <div className="p-4 bg-orange-50 text-orange-600 rounded-lg text-sm mb-4">
              尚未配置任何代码仓库。请先在 <strong>设置 - skill 仓库</strong> 中添加配置。
            </div>
          ) : (
            <div style={styles.row}>
              <label style={styles.label}>选择目标仓库</label>
              <div style={styles.selectWrapper}>
                <select
                  style={styles.select(focusedField === 'select')}
                  value={selectedRepoId}
                  onChange={(e) => setSelectedRepoId(e.target.value)}
                  onFocus={() => setFocusedField('select')}
                  onBlur={() => setFocusedField(null)}
                >
                  {repos.map(r => (
                    <option key={r.id} value={r.id}>
                      [{r.type === 'gerrit' ? 'Gerrit' : 'GitHub'}] {r.name} ({r.url})
                    </option>
                  ))}
                </select>
                <span style={styles.selectArrow}>▾</span>
              </div>
            </div>
          )}

          {/* 仓库类型标识 */}
          {selectedRepo && (
            <div style={{ ...styles.row, marginBottom: '12px' }}>
              <span style={styles.label}>仓库类型</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '13px', fontWeight: '600',
                padding: '4px 12px', borderRadius: '8px',
                backgroundColor: isGerrit ? '#fff7ed' : '#eff6ff',
                color: isGerrit ? '#f97316' : '#3b82f6',
                border: `1px solid ${isGerrit ? '#fed7aa' : '#bfdbfe'}`,
              }}>
                {isGerrit ? <Server size={13} /> : <GitBranch size={13} />}
                {isGerrit ? 'Gerrit (Code Review)' : 'GitHub'}
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {isUploading && uploadStatus && (
            <div style={styles.statusText}>{uploadStatus}</div>
          )}
        </div>

        <div style={styles.actions}>
          <button style={styles.btnCancel} onClick={onClose} disabled={isUploading}>
            <X size={16} />
            <span>取消</span>
          </button>
          <button
            style={styles.btnSubmit(isUploading || repos.length === 0)}
            onClick={handleUpload}
            disabled={isUploading || repos.length === 0}
          >
            {isUploading ? (
              <span>提交中...</span>
            ) : (
              <>
                <Check size={16} />
                <span>{isGerrit ? '提交到 Gerrit' : '确认提交'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
