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
      }
    } catch (e) {
      console.error('Update check failed:', e);
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
    } catch (e) {
      setStatus((s) => ({
        ...s,
        downloading: false,
        error: `更新失败: ${e}`,
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