# SkillHub Tauri 应用 OTA 在线升级架构设计

## 1. 概述

本文档描述如何为基于 **Tauri v2** 的 SkillHub 桌面应用实现 OTA（Over-The-Air）在线升级功能，使用户无需手动下载安装包即可自动获取最新版本。

### 技术栈
| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2.11 |
| 前端 | React 19 + TypeScript + Vite |
| 后端 (Rust) | tauri-plugin-updater |
| 更新服务端 | 静态文件服务器 (Nginx / OSS) + JSON Manifest |
| CI/CD | GitHub Actions |

---

## 2. 核心原理

Tauri 官方提供了 `tauri-plugin-updater` 插件，内置了完整的更新检测、下载、安装流程。其工作方式为：

```
┌──────────┐    HTTP GET      ┌────────────────┐
│  SkillHub │ ◄────────────── │  更新服务器      │
│  (客户端)  │    JSON Manifest │  (Nginx / OSS)  │
└──────────┘                  └────────────────┘
     │                               │
     │  1. 定时/手动检查更新          │
     │  2. 比对 Manifest 中的版本号   │
     │  3. 下载 .msi / .dmg / .AppImage
     │  4. 验证签名 + 安装
     │  5. 重启应用
```

- **Manifest 文件**：一个 JSON 文件，描述最新版本号、下载地址、签名信息。
- **安装包**：与 `npm run tauri:build` 产物一致，放在服务器上供下载。
- **签名验证**：确保下载的包未被篡改。

---

## 3. 架构总览

```
                         ┌──────────────────────────────────┐
                         │         CI/CD (GitHub Actions)     │
                         │                                    │
                         │  git tag v1.2.0  ──►  Build       │
                         │    ├─ Windows .msi                 │
                         │    ├─ macOS .dmg                   │
                         │    └─ Linux .AppImage              │
                         │         │                          │
                         │         ▼                          │
                         │  上传到 Release + 更新 Manifest     │
                         └──────────────────────────────────┘
                                           │
                                           ▼
                         ┌──────────────────────────────────┐
                         │       更新服务器 (静态存储)         │
                         │                                    │
                         │  /releases/latest.json  (Manifest) │
                         │  /releases/v1.2.0/                  │
                         │    ├─ skillhub_1.2.0_x64.msi       │
                         │    ├─ skillhub_1.2.0_x64.dmg       │
                         │    └─ skillhub_1.2.0_amd64.AppImage│
                         └──────────────────────────────────┘
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                         ┌────────┐  ┌────────┐  ┌────────┐
                         │Windows │  │ macOS  │  │ Linux  │
                         │ 客户端  │  │ 客户端  │  │ 客户端  │
                         └────────┘  └────────┘  └────────┘
```

---

## 4. 详细设计

### 4.1 Rust 端 (src-tauri)

#### 4.1.1 添加依赖

在 `src-tauri/Cargo.toml` 中添加：

```toml
[dependencies]
tauri-plugin-updater = "2"
```

#### 4.1.2 注册插件

在 `src-tauri/src/lib.rs` 的 `run()` 函数中注册插件：

```rust
use tauri_plugin_updater::UpdaterExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())  // 新增
        .invoke_handler(tauri::generate_handler![
            // ... 已有的 commands
        ])
        .setup(|app| {
            // ... 已有 setup 代码
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 4.1.3 配置 tauri.conf.json

在 `src-tauri/tauri.conf.json` 中添加 updater 配置：

```json
{
  "productName": "skillhub",
  "version": "0.1.0",
  "identifier": "com.skillshub.desktop",
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_BASE64",
      "endpoints": [
        "https://your-update-server.com/releases/latest.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "createUpdaterArtifacts": true
  }
}
```

关键字段说明：
- `pubkey`：公钥，用于验证更新包签名（**必须**生成，见 4.4 节）
- `endpoints`：Manifest 文件的 URL 列表（支持多个作为 fallback）
- `windows.installMode`：
  - `passive`：后台下载，用户无感知安装
  - `basicUi`：显示简单的进度条 UI
- `createUpdaterArtifacts`：`true` 时 `tauri build` 会自动生成 `.sig` 签名文件

### 4.2 前端 (React)

#### 4.2.1 封装更新检查 Hook

新建 `src/hooks/useUpdater.ts`：

```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useCallback } from 'react';

interface UpdateStatus {
  available: boolean;
  version?: string;
  body?: string;
  downloading: boolean;
  progress: number; // 0-100
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
        return update;
      }
    } catch (e) {
      console.error('Update check failed:', e);
    }
    return null;
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      const update = await check();
      if (!update) return;

      setStatus(s => ({ ...s, downloading: true, progress: 0 }));

      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setStatus(s => ({ ...s, downloading: true }));
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const total = event.data.contentLength ?? 0;
            setStatus(s => ({
              ...s,
              progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            }));
            break;
          case 'Finished':
            setStatus(s => ({ ...s, downloading: false, progress: 100 }));
            break;
        }
      });

      // 安装完成后提示重启
      await relaunch();
    } catch (e) {
      console.error('Download/install failed:', e);
      setStatus(s => ({ ...s, downloading: false }));
    }
  }, []);

  return { status, checkUpdate, downloadAndInstall };
}
```

#### 4.2.2 更新提示 UI 组件

在 `src/components/UpdateNotification.tsx` 中创建通知组件：

```tsx
import { useEffect } from 'react';
import { useUpdater } from '../hooks/useUpdater';

export default function UpdateNotification() {
  const { status, checkUpdate, downloadAndInstall } = useUpdater();

  // 应用启动后 3 秒自动检查更新
  useEffect(() => {
    const timer = setTimeout(checkUpdate, 3000);
    return () => clearTimeout(timer);
  }, [checkUpdate]);

  if (!status.available) return null;

  return (
    <div className="update-banner">
      {status.downloading ? (
        <div>
          <span>正在下载更新... {status.progress}%</span>
          <progress value={status.progress} max={100} />
        </div>
      ) : (
        <div>
          <span>新版本 {status.version} 可用</span>
          {status.body && <p>{status.body}</p>}
          <button onClick={downloadAndInstall}>立即更新</button>
        </div>
      )}
    </div>
  );
}
```

将此组件挂载到 [Layout.tsx](src/components/Layout.tsx) 中即可全局生效。

### 4.3 更新服务器

#### 4.3.1 Manifest 文件格式

`/releases/latest.json`：

```json
{
  "version": "1.2.0",
  "notes": "修复了登录 Bug，新增暗色模式。",
  "pub_date": "2026-05-20T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9t...",
      "url": "https://your-server.com/releases/v1.2.0/skillhub_1.2.0_x64.msi"
    },
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZS...",
      "url": "https://your-server.com/releases/v1.2.0/skillhub_1.2.0_x64.dmg"
    },
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://your-server.com/releases/v1.2.0/skillhub_1.2.0_aarch64.dmg"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://your-server.com/releases/v1.2.0/skillhub_1.2.0_amd64.AppImage"
    }
  }
}
```

#### 4.3.2 服务器选型

| 方案 | 适用场景 | 成本 |
|---|---|---|
| **Nginx + 自有服务器** | 完全控制，可做灰度、CDN | 中等 |
| **阿里云 OSS / 腾讯云 COS + CDN** | 国内用户，低延迟 | 按量付费 |
| **GitHub Releases** | 开源项目，零成本 | 免费（国内访问慢） |

**推荐方案**：GitHub Releases（开源/小团队）或 OSS + CDN（面向国内用户）。

### 4.4 签名密钥生成（安全核心）

Tauri updater 使用 **ed25519** 非对称加密确保更新包的完整性和来源可信。

#### 生成密钥对

```bash
npm run tauri signer generate -- -w ~/.tauri/skillhub.key
```

这会生成：
- 私钥文件 `~/.tauri/skillhub.key`（**绝不能泄露**，仅 CI/CD 持有）
- 公钥（输出到终端，配置到 `tauri.conf.json` 的 `pubkey` 字段）

#### 签名流程

每次 `tauri build` 时（或 CI/CD 构建时），自动使用私钥对安装包签名，生成 `.sig` 文件。客户端下载后会用内置公钥验证签名。

### 4.5 CI/CD 自动化发布 (GitHub Actions)

创建 `.github/workflows/release.yml`：

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Rust
        uses: actions-rust-lang/setup-rust-toolchain@v1

      - name: Install dependencies
        run: npm ci

      - name: Build Tauri app
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        run: npm run tauri:build -- --target ${{ matrix.target }}

      - name: Upload to Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            src-tauri/target/${{ matrix.target }}/release/bundle/msi/*.msi*
            src-tauri/target/${{ matrix.target }}/release/bundle/dmg/*.dmg*
            src-tauri/target/${{ matrix.target }}/release/bundle/appimage/*.AppImage*
```

CI/CD 中需要用到的 GitHub Secrets：
- `TAURI_PRIVATE_KEY`：签名私钥内容
- `TAURI_KEY_PASSWORD`：私钥密码（如有）

#### 自动生成 Manifest

在 release workflow 最后增加一个步骤，使用脚本根据上传的文件 URL 自动生成 `latest.json` 并上传到服务器。

### 4.6 更新策略

| 策略 | 描述 | 实现方式 |
|---|---|---|
| **启动时检查** | 应用打开时自动检查更新 | `useEffect` 延迟 3s 调用 `check()` |
| **手动检查** | 用户在设置页点击"检查更新" | 暴露一个按钮调用 `checkUpdate()` |
| **定时轮询** | 每 N 小时检查一次 | `setInterval` + `check()` |
| **静默下载** | 后台下载，下次启动时安装 | `installMode: "passive"` |
| **强制更新** | 低于某版本号必须更新 | Manifest 中加入 `min_version` 字段 |

**推荐组合策略**：
1. **启动时静默检查** → 发现新版本 → 显示通知横幅
2. **用户手动触发** → 下载 + 安装 + 重启
3. **可选**：在 Manifest 中设 `min_version`，低于此版本的客户端强制弹出更新提示

---

## 5. 完整更新流程图

```
  应用启动
     │
     ▼
  setTimeout 3s
     │
     ▼
  check() ──► GET /releases/latest.json
     │                    │
     │                    ▼
     │              比对 manifest.version
     │              vs 当前 tauri.conf.json version
     │                    │
     ├── 相同 ──► 无操作
     │
     └── 不同 ──► 弹出 UpdateNotification
                      │
               用户点击 "立即更新"
                      │
                      ▼
             update.downloadAndInstall()
                      │
              ┌───────┼───────┐
              ▼       ▼       ▼
           Started Progress Finished
              │       │       │
              │   进度条更新   │
              │               ▼
              │        验证签名 (.sig)
              │               │
              │         签名有效？
              │         ├─ 是 ──► 运行安装程序
              │         └─ 否 ──► 中止，提示错误
              │                     │
              └──────────────────────┘
                      │
                      ▼
                 relaunch() 重启应用
                      │
                      ▼
                新版本运行中
```

---

## 6. 异常处理

| 异常场景 | 处理方式 |
|---|---|
| 网络不可达 | `check()` 失败静默处理，不弹错误 |
| 签名验证失败 | 中止安装，提示"更新包可能被篡改" |
| 下载中断 | 下次启动重新下载（断点续传不内置支持，小包影响不大） |
| 安装失败 | 保留旧版本，提示用户手动下载 |
| 更新服务器不可用 | 降级到第二个 endpoint（`endpoints` 数组支持多个 URL） |

---

## 7. 实施步骤（推荐顺序）

| 步骤 | 内容 | 预估工时 |
|---|---|---|
| 1 | 生成签名密钥，配置 `tauri.conf.json` | 15 分钟 |
| 2 | 添加 `tauri-plugin-updater` 依赖，注册插件 | 10 分钟 |
| 3 | 搭建静态文件服务器，上传首个 Manifest + 安装包 | 30 分钟 |
| 4 | 前端实现 `useUpdater` hook + 通知 UI | 1 小时 |
| 5 | 配置 GitHub Actions 自动化构建 + 发布 | 1 小时 |
| 6 | 编写 Manifest 自动生成脚本 | 30 分钟 |
| 7 | 端到端测试：构建 v0.1.0 → 安装 → 发布 v0.2.0 → 验证更新 | 1 小时 |

---

## 8. 关键注意事项

1. **版本号一致性**：`tauri.conf.json`、`package.json`、Manifest 中的 `version` 三者必须对齐。建议 CI 中从 git tag 自动提取版本号写入各处。

2. **Windows 安装模式**：`.msi` 安装包在 passive 模式下需要管理员权限。如果用户没有管理员权限，会安装失败。可以降级为 `basicUi` 或提示用户手动安装。

3. **macOS 签名与公证**：macOS 的 `.dmg` 必须经过 Apple 公证（notarization），否则 Gatekeeper 会阻止安装。建议 CI 中集成 `gon` 或 `notarytool`。

4. **私钥安全**：
   - 私钥**永远不要**提交到 Git 仓库
   - 仅在 CI/CD 环境变量 (GitHub Secrets) 中使用
   - 定期轮换密钥对

5. **测试环境**：建议在正式发布前，先搭建一个 staging 更新服务器用于测试，Manifest 的 `endpoints` 可以根据 `--debug` 编译标志自动切换。

6. **回滚方案**：如果新版本有严重 bug，只需将 Manifest 中的 `version` 回退到上一个稳定版本号，所有客户端会停止提示更新。已更新的用户需手动降级。