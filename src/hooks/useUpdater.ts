import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useCallback } from 'react';

export interface UpdateStatus {
  available: boolean;
  version?: string;
  body?: string;
  downloading: boolean;
  progress: number;
  error?: string;
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    available: false,
    downloading: false,
    progress: 0,
  });

  const formatError = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    return fallback;
  };

  const checkUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        setStatus({
          available: true,
          version: update.version,
          body: update.body,
          downloading: false,
          progress: 0,
        });
      } else {
        setStatus({
          available: false,
          downloading: false,
          progress: 0,
        });
      }
    } catch (error) {
      console.error('Update check failed:', error);
      setStatus({
        available: false,
        downloading: false,
        progress: 0,
        error: `更新检查失败: ${formatError(error, '未知错误')}`,
      });
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      const update = await check();
      if (!update) return;

      setStatus((s) => ({ ...s, downloading: true, progress: 0 }));

      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            setStatus((s) => ({ ...s, downloading: true }));
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setStatus((s) => ({
              ...s,
              progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            }));
            break;
          case 'Finished':
            setStatus((s) => ({ ...s, downloading: false, progress: 100 }));
            break;
        }
      });

      await relaunch();
    } catch (error) {
      setStatus((s) => ({
        ...s,
        downloading: false,
        error: `更新失败: ${formatError(error, '未知错误')}`,
      }));
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus({
      available: false,
      downloading: false,
      progress: 0,
    });
  }, []);

  return { status, checkUpdate, downloadAndInstall, dismiss };
}