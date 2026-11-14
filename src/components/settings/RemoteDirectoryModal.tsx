import { useEffect, useState } from 'react';
import { X, Server, Loader2, CheckCircle2, AlertCircle, FolderSearch } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { RemoteConfig } from '../../config/platforms';

interface RemoteDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 编辑模式时传入当前配置 */
  initialName?: string;
  initialRemote?: RemoteConfig;
  onSave: (name: string, remote: RemoteConfig) => void;
}

type TestStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

export function RemoteDirectoryModal({
  isOpen,
  onClose,
  initialName,
  initialRemote,
  onSave,
}: RemoteDirectoryModalProps) {
  const isEditing = !!initialRemote;

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [remotePath, setRemotePath] = useState('~/.claude/skills');
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>('key');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [password, setPassword] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setHost(initialRemote?.host || '');
      setPort(String(initialRemote?.port ?? 22));
      setUsername(initialRemote?.username || '');
      setRemotePath(initialRemote?.remotePath || '~/.claude/skills');
      setAuthMethod(initialRemote?.authMethod || 'key');
      setPrivateKeyPath(initialRemote?.privateKeyPath || '');
      setPassword('');
      setTestStatus({ state: 'idle' });
      setFormError('');
      setSaving(false);
    }
  }, [isOpen, initialName, initialRemote]);

  if (!isOpen) return null;

  const validate = (): RemoteConfig | null => {
    const trimmedHost = host.trim();
    const trimmedUser = username.trim();
    const trimmedPath = remotePath.trim();
    const portNum = Number(port);

    if (!name.trim()) { setFormError('请输入名称'); return null; }
    if (!trimmedHost) { setFormError('请输入主机地址'); return null; }
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum >= 65536) {
      setFormError('端口号无效');
      return null;
    }
    if (!trimmedUser) { setFormError('请输入用户名'); return null; }
    if (!trimmedPath) { setFormError('请输入远程路径'); return null; }
    if (authMethod === 'password' && !isEditing && !password) {
      setFormError('请输入 SSH 密码');
      return null;
    }

    setFormError('');
    return {
      host: trimmedHost,
      port: portNum,
      username: trimmedUser,
      remotePath: trimmedPath,
      authMethod,
      privateKeyPath: privateKeyPath.trim() || undefined,
    };
  };

  const toPayload = (remote: RemoteConfig) => ({
    host: remote.host,
    port: remote.port,
    username: remote.username,
    auth_method: remote.authMethod,
    private_key_path: remote.privateKeyPath ?? null,
  });

  const handleBrowseKey = async () => {
    try {
      const selected = await open({ multiple: false, title: '选择 SSH 私钥文件' });
      if (selected && typeof selected === 'string') {
        setPrivateKeyPath(selected);
      }
    } catch (err) {
      console.error('Failed to open file dialog', err);
    }
  };

  const handleTest = async () => {
    const remote = validate();
    if (!remote) return;

    setTestStatus({ state: 'testing' });
    try {
      const message = await invoke<string>('test_ssh_connection', {
        remote: toPayload(remote),
        remotePath: remote.remotePath,
        password: authMethod === 'password' && password ? password : null,
      });
      setTestStatus({ state: 'success', message });
    } catch (err) {
      setTestStatus({ state: 'error', message: String(err) });
    }
  };

  const handleSave = async () => {
    const remote = validate();
    if (!remote) return;

    setSaving(true);
    try {
      if (authMethod === 'password' && password) {
        await invoke('save_ssh_password', {
          host: remote.host,
          port: remote.port,
          username: remote.username,
          password,
        });
      }
      onSave(name.trim(), remote);
      onClose();
    } catch (err) {
      setFormError(`保存密码失败: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div
        className="modal-container fade-in"
        style={{ maxWidth: '560px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header" style={{ padding: '20px 24px' }}>
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} className="text-primary" />
            {isEditing ? '编辑远程目录' : '添加远程目录'}
          </h3>
          <button
            className="modal-close-btn"
            style={{ outline: 'none', position: 'absolute', right: '20px', top: '22px' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '0 24px 8px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
          <label className="form-label" style={{ marginTop: '0.5rem' }}>名称</label>
          <input
            type="text"
            className="form-input"
            placeholder="例如：开发机 86 服务器"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 3 }}>
              <label className="form-label" style={{ marginTop: '1rem' }}>主机</label>
              <input
                type="text"
                className="form-input"
                placeholder="例如：192.168.1.86 或 dev.example.com"
                value={host}
                onChange={e => setHost(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label" style={{ marginTop: '1rem' }}>端口</label>
              <input
                type="number"
                className="form-input"
                placeholder="22"
                value={port}
                onChange={e => setPort(e.target.value)}
              />
            </div>
          </div>

          <label className="form-label" style={{ marginTop: '1rem' }}>用户名</label>
          <input
            type="text"
            className="form-input"
            placeholder="SSH 登录用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />

          <label className="form-label" style={{ marginTop: '1rem' }}>远程 Skill 存放路径</label>
          <input
            type="text"
            className="form-input"
            placeholder="~/.claude/skills"
            value={remotePath}
            onChange={e => setRemotePath(e.target.value)}
          />
          <p className="form-helper">支持 ~ 开头的路径（按远程用户主目录展开）</p>

          <label className="form-label" style={{ marginTop: '0.5rem' }}>认证方式</label>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input
                type="radio"
                name="ssh-auth-method"
                className="accent-primary"
                checked={authMethod === 'key'}
                onChange={() => setAuthMethod('key')}
              />
              SSH 密钥
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input
                type="radio"
                name="ssh-auth-method"
                className="accent-primary"
                checked={authMethod === 'password'}
                onChange={() => setAuthMethod('password')}
              />
              密码
            </label>
          </div>

          {authMethod === 'key' ? (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, marginBottom: 0 }}
                  placeholder="私钥路径，留空自动使用 ~/.ssh/id_ed25519 或 id_rsa"
                  value={privateKeyPath}
                  onChange={e => setPrivateKeyPath(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary focus:outline-none"
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={handleBrowseKey}
                >
                  <FolderSearch size={14} />
                  浏览
                </button>
              </div>
              <p className="form-helper">暂不支持带 passphrase 保护的私钥</p>
            </>
          ) : (
            <>
              <input
                type="password"
                className="form-input"
                placeholder={isEditing ? '留空则保持已保存的密码不变' : 'SSH 登录密码'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="form-helper">密码保存在系统凭据管理器中，不会写入配置文件</p>
            </>
          )}

          {formError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.5rem',
              padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2',
              borderRadius: '8px', border: '1px solid #fecaca',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {formError}
            </div>
          )}

          {testStatus.state === 'success' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#16a34a', fontSize: '0.8125rem', marginTop: '0.5rem',
              padding: '0.5rem 0.75rem', backgroundColor: '#f0fdf4',
              borderRadius: '8px', border: '1px solid #bbf7d0',
              wordBreak: 'break-all',
            }}>
              <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
              {testStatus.message}
            </div>
          )}
          {testStatus.state === 'error' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.5rem',
              padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2',
              borderRadius: '8px', border: '1px solid #fecaca',
              wordBreak: 'break-all',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {testStatus.message}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn btn-secondary focus:outline-none"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={testStatus.state === 'testing' || saving}
            onClick={handleTest}
          >
            {testStatus.state === 'testing'
              ? <Loader2 size={14} className="animate-spin" />
              : <Server size={14} />}
            {testStatus.state === 'testing' ? '测试中...' : '测试连接'}
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary focus:outline-none"
              disabled={saving}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary focus:outline-none"
              disabled={saving || testStatus.state === 'testing'}
              onClick={handleSave}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
