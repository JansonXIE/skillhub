import { useEffect } from 'react';
import { useUpdater } from '../hooks/useUpdater';

export default function UpdateNotification() {
  const { status, checkUpdate, downloadAndInstall, dismiss } = useUpdater();

  useEffect(() => {
    const isAutoCheck = localStorage.getItem('skillhub-auto-check-update') !== 'false';
    if (!isAutoCheck) return;

    const timer = setTimeout(checkUpdate, 3000);
    return () => clearTimeout(timer);
  }, [checkUpdate]);

  if (!status.available && !status.error) return null;

  return (
    <div className="update-notification">
      {status.error ? (
        <div className="update-notification-content error">
          <span className="text-body">{status.error}</span>
          <button className="btn btn-ghost btn-icon" onClick={dismiss}>
            &times;
          </button>
        </div>
      ) : status.downloading ? (
        <div className="update-notification-content">
          <span className="text-body">
            正在下载更新... {status.progress}%
          </span>
          <progress
            className="update-progress"
            value={status.progress}
            max={100}
          />
        </div>
      ) : (
        <div className="update-notification-content">
          <div className="flex flex-col gap-2">
            <span className="text-body" style={{ fontWeight: 600 }}>
              新版本 {status.version} 可用
            </span>
            {status.body && (
              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                {status.body}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={downloadAndInstall}>
              立即更新
            </button>
            <button className="btn btn-ghost" onClick={dismiss}>
              稍后提醒
            </button>
          </div>
        </div>
      )}
    </div>
  );
}