# SkillHub OTA 更新 — 详细部署操作指南

## 前置信息

| 项目 | 值 |
|---|---|
| GitHub 仓库 | `JansonXIE/skillhub` |
| 签名私钥 | `~/.tauri/skillhub.key` |
| 私钥密码 | `<你的私钥密码>` |
| 公钥 | 已写入 `tauri.conf.json` |
| 安装包格式 | `.msi` (Windows) |

---

## 步骤 1：搭建更新服务器（使用 GitHub Releases，免费）

你的更新服务器就是 **GitHub Releases** 本身，无需额外部署任何服务器。

### 1.1 手动构造 latest.json（仅第一次需要手动验证）

以后每次 CI/CD 打 tag 会自动生成并上传。但为了理解原理，先手动做一次：

创建文件 `latest.json`，内容如下：

```json
{
  "version": "0.1.0",
  "notes": "首个 OTA 版本，包含自动更新功能。",
  "pub_date": "2026-05-20T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTQkFXeVBPWFJ0TzRKVWhoalFoYUFScEVzc2NJeU42OXdQQjlNemt0V0M5NUNqOExsODIyQTNVakZxVVM4UmM4WEtRdGJrQi9tUTNkeC9ISFc5SjIwWi8wSlM0YmxSUFF3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzc5MjUwMjA3CWZpbGU6c2tpbGxodWJfMC4xLjBfeDY0X2VuLVVTLm1zaQpWZHlZK2xJUnZNTnIvczdjVk9uN01BSG1Xc1E4L0Z3UHNrSWFVSE44WVFSR1AvM29sdk9UU0trWklaRzU5NlAvSml3QzZOQTlvU2NMbkE5YnlZSDZEUT09Cg==",
      "url": "https://github.com/JansonXIE/skillhub/releases/download/v0.1.0/skillhub_0.1.0_x64_en-US.msi"
    }
  }
}
```

> **signature 的值**来自 `src-tauri/target/release/bundle/msi/skillhub_0.1.0_x64_en-US.msi.sig` 文件的内容。如果重新构建，sig 会变化，需要重新读取。

### 1.2 创建 GitHub Release 并上传文件

1. 打开 https://github.com/JansonXIE/skillhub/releases
2. 点击 **「Draft a new release」**
3. 填写表单：
   - **Tag**: 输入 `v0.1.0`，选择 **「Create new tag」**
   - **Release title**: `v0.1.0 - 首个 OTA 版本`
   - **Description**: 写更新日志
4. 将以下 3 个文件拖入附件区域：
   - `src-tauri/target/release/bundle/msi/skillhub_0.1.0_x64_en-US.msi`
   - `src-tauri/target/release/bundle/msi/skillhub_0.1.0_x64_en-US.msi.sig`
   - 上面手动创建的 `latest.json`
5. 点击 **「Publish release」**

### 1.3 验证 Manifest 可访问

发布后，在浏览器打开：

```
https://github.com/JansonXIE/skillhub/releases/latest/download/latest.json
```

应该能看到上面构造的 JSON 内容。

---

## 步骤 2：设置 GitHub Actions CI/CD

### 2.1 确认工作流文件已就绪

文件 [.github/workflows/release.yml](../../.github/workflows/release.yml) 已创建，核心逻辑：

```
打 tag v*.*.* → 触发构建
  ├─ 编译前端 (tsc + vite)
  ├─ 编译 Rust (tauri build --bundles msi)
  ├─ 私钥签名 → 生成 .msi + .msi.sig
  ├─ 运行 scripts/generate-manifest.js → 生成 latest.json
  └─ 上传所有文件到 GitHub Release
```

### 2.2 添加 GitHub Secrets

**这是最关键的一步，没有 Secrets 无法签名。**

1. 打开 https://github.com/JansonXIE/skillhub/settings/secrets/actions
2. 点击 **「New repository secret」**
3. 添加以下两个 Secret：

#### Secret 1：`TAURI_SIGNING_PRIVATE_KEY`

- **Name**: `TAURI_SIGNING_PRIVATE_KEY`
- **Secret**: 私钥文件的**完整内容**（去掉末尾换行），即：

```
<你的私钥内容，从 ~/.tauri/skillhub.key 复制>
```

> 获取方式：在终端执行 `cat ~/.tauri/skillhub.key`，复制全部内容。

#### Secret 2：`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

- **Name**: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- **Secret**:

```
<你的私钥密码>
```

添加完成后，Secrets 页面应显示这两个条目。

### 2.3 提交代码到 GitHub

```bash
git add .
git commit -m "feat: add OTA updater with GitHub Actions CI/CD"
git push origin master
```

### 2.4 触发一次发版测试

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送 tag 后，打开 https://github.com/JansonXIE/skillhub/actions 可以看到 `Build and Release` 工作流正在运行。

运行成功后，打开 https://github.com/JansonXIE/skillhub/releases 可以看到新 Release 包含了 `.msi`、`.msi.sig` 和 `latest.json`。

---

## 步骤 3：验证端点 URL

### 3.1 当前配置

[tauri.conf.json:30](../../src-tauri/tauri.conf.json#L30) 已更新为正确的 URL：

```json
"endpoints": [
  "https://github.com/JansonXIE/skillhub/releases/latest/download/latest.json"
]
```

### 3.2 如何自定义更新服务器地址

如果你以后不想用 GitHub Releases，改用自建服务器，只需修改 `endpoints` 数组：

```json
"endpoints": [
  "https://your-cdn.example.com/releases/latest.json",
  "https://github.com/JansonXIE/skillhub/releases/latest/download/latest.json"
]
```

数组中的多个 URL 会依次尝试，第一个不可用时自动 fallback 到第二个。

---

## 步骤 4：端到端验证 OTA 更新

### 4.1 安装旧版本

1. 安装 `skillhub_0.1.0_x64_en-US.msi`
2. 打开应用，确认正常运行

### 4.2 发布新版本

1. 修改代码（例如改个标题）
2. 更新 `src-tauri/tauri.conf.json` 中的 `version` 为 `0.2.0`
3. 提交并打 tag：

```bash
git add .
git commit -m "feat: some new feature"
git tag v0.2.0
git push origin master
git push origin v0.2.0
```

4. 等待 GitHub Actions 构建完成，新 Release 自动创建

### 4.3 验证客户端收到更新

1. 打开旧版本 (v0.1.0) 应用
2. 等待 3 秒，应看到顶部蓝色横幅：**「新版本 0.2.0 可用」**
3. 点击 **「立即更新」**
4. 看到下载进度条
5. 下载完成后应用自动重启，已是新版本

---

## 常见问题

### Q: 为什么 MSI 安装需要管理员权限？

MSI 默认需要管理员权限。两种解决方案：

**方案 A（推荐）**：改用 NSIS 安装包，在 `tauri.conf.json` 中设置：

```json
"bundle": {
  "targets": "nsis",
  "windows": {
    "nsis": {
      "installMode": "currentUser"
    }
  }
}
```

**方案 B**：保持 MSI，但在 passive 模式下如果用户无管理员权限会静默失败，此时可改为 `basicUi` 模式提示用户手动安装。

### Q: 构建时 NSIS 报 "Access Denied" 怎么办？

这是 Windows Defender 或杀毒软件拦截了 NSIS 的下载。在 CI 中不会出现（GitHub Actions 环境无此限制）。

### Q: macOS 需要公证怎么办？

需要在 GitHub Actions 中增加 Apple 公证步骤，涉及 Apple Developer 账号和 `notarytool`。

### Q: 如何实现强制更新？

在 `latest.json` 中增加 `min_version` 字段，前端检查当前版本低于此值时不显示"稍后提醒"按钮。

---

## 文件清单

| 文件 | 作用 |
|---|---|
| `.github/workflows/release.yml` | CI/CD 自动构建 + 发布 |
| `scripts/generate-manifest.js` | 自动生成 latest.json |
| `~/.tauri/skillhub.key` | 私钥（**本地持有，已上传 CI Secret**） |
| `~/.tauri/skillhub.key.pub` | 公钥（**已写入 tauri.conf.json**） |