use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use russh::client;
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Deserialize, Clone)]
pub struct RemoteInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String, // "key" | "password"
    pub private_key_path: Option<String>,
}

const KEYRING_SERVICE: &str = "skillhub-ssh";

fn keyring_entry(host: &str, port: u16, username: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("{}@{}:{}", username, host, port))
        .map_err(|e| format!("Failed to access system credential store: {}", e))
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

fn expand_local_path(path: &str) -> PathBuf {
    let mut expanded = path.to_string();
    if let Some(home) = home_dir() {
        let home_str = home.to_string_lossy().to_string();
        if expanded.contains("%USERPROFILE%") {
            expanded = expanded.replace("%USERPROFILE%", &home_str);
        }
        if expanded == "~" {
            expanded = home_str;
        } else if expanded.starts_with("~/") || expanded.starts_with("~\\") {
            expanded = format!("{}{}", home_str, &expanded[1..]);
        }
    }
    PathBuf::from(expanded)
}

fn resolve_private_key(remote: &RemoteInfo) -> Result<PathBuf, String> {
    if let Some(configured) = remote
        .private_key_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        let path = expand_local_path(configured);
        if !path.exists() {
            return Err(format!("Private key not found: {}", path.display()));
        }
        return Ok(path);
    }

    let home = home_dir().ok_or("Could not find home directory")?;
    for name in ["id_ed25519", "id_rsa", "id_ecdsa"] {
        let candidate = home.join(".ssh").join(name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("No private key found in ~/.ssh (tried id_ed25519, id_rsa, id_ecdsa). Configure a key path or use password auth.".to_string())
}

pub struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Skills sync targets are user-configured internal servers; accept host keys.
        Ok(true)
    }
}

pub async fn connect_sftp(
    remote: &RemoteInfo,
    password_override: Option<&str>,
) -> Result<(client::Handle<ClientHandler>, SftpSession), String> {
    let config = Arc::new(client::Config::default());
    let mut session = client::connect(config, (remote.host.as_str(), remote.port), ClientHandler)
        .await
        .map_err(|e| format!("Failed to connect to {}:{}: {}", remote.host, remote.port, e))?;

    let auth_result = if remote.auth_method == "password" {
        let password = match password_override.map(str::to_string) {
            Some(p) if !p.is_empty() => p,
            _ => {
                let entry = keyring_entry(&remote.host, remote.port, &remote.username)?;
                entry.get_password().map_err(|_| {
                    "未找到已保存的 SSH 密码，请在「设置 - Skill 存放目录」中重新编辑该远程目录并输入密码".to_string()
                })?
            }
        };
        session
            .authenticate_password(remote.username.clone(), password)
            .await
            .map_err(|e| format!("Password authentication error: {}", e))?
    } else {
        let key_path = resolve_private_key(remote)?;
        let key = load_secret_key(&key_path, None).map_err(|e| {
            format!(
                "Failed to load private key {} (passphrase-protected keys are not supported yet): {}",
                key_path.display(),
                e
            )
        })?;
        let hash_alg = session
            .best_supported_rsa_hash()
            .await
            .map_err(|e| format!("Failed to negotiate RSA hash: {}", e))?
            .flatten();
        session
            .authenticate_publickey(
                remote.username.clone(),
                PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg),
            )
            .await
            .map_err(|e| format!("Key authentication error: {}", e))?
    };

    if !auth_result.success() {
        return Err(format!(
            "SSH authentication failed for {}@{}:{} (method: {})",
            remote.username, remote.host, remote.port, remote.auth_method
        ));
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open SSH channel: {}", e))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("Failed to request SFTP subsystem: {}", e))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("Failed to start SFTP session: {}", e))?;

    Ok((session, sftp))
}

async fn close_connection(session: client::Handle<ClientHandler>, sftp: SftpSession) {
    let _ = sftp.close().await;
    let _ = session
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;
}

/// Expand a leading `~` using the SFTP server's home directory.
pub async fn expand_remote_path(sftp: &SftpSession, path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed == "~" || trimmed.starts_with("~/") {
        let home = sftp
            .canonicalize(".")
            .await
            .map_err(|e| format!("Failed to resolve remote home directory: {}", e))?;
        let home = home.trim_end_matches('/').to_string();
        if trimmed == "~" {
            Ok(home)
        } else {
            Ok(format!("{}/{}", home, &trimmed[2..]))
        }
    } else {
        Ok(trimmed)
    }
}

async fn remote_exists(sftp: &SftpSession, path: &str) -> bool {
    sftp.metadata(path).await.is_ok()
}

pub async fn remote_create_dir_all(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let mut current = if path.starts_with('/') {
        "/".to_string()
    } else {
        String::new()
    };

    for part in path.split('/').filter(|p| !p.is_empty() && *p != ".") {
        if !current.is_empty() && !current.ends_with('/') {
            current.push('/');
        }
        current.push_str(part);
        if !remote_exists(sftp, &current).await {
            if let Err(e) = sftp.create_dir(&current).await {
                // Tolerate races / servers that report existence lazily
                if !remote_exists(sftp, &current).await {
                    return Err(format!("Failed to create remote directory {}: {}", current, e));
                }
            }
        }
    }
    Ok(())
}

pub async fn remote_remove_dir_all(sftp: &SftpSession, path: &str) -> Result<(), String> {
    if !remote_exists(sftp, path).await {
        return Ok(());
    }

    // Iterative walk to avoid async recursion: delete files on the way down,
    // then remove directories deepest-first.
    let mut pending = vec![path.to_string()];
    let mut dirs: Vec<String> = Vec::new();

    while let Some(dir) = pending.pop() {
        let entries = sftp
            .read_dir(&dir)
            .await
            .map_err(|e| format!("Failed to read remote directory {}: {}", dir, e))?;
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let child = format!("{}/{}", dir.trim_end_matches('/'), name);
            if entry.file_type().is_dir() {
                pending.push(child);
            } else {
                sftp.remove_file(&child)
                    .await
                    .map_err(|e| format!("Failed to delete remote file {}: {}", child, e))?;
            }
        }
        dirs.push(dir);
    }

    for dir in dirs.iter().rev() {
        sftp.remove_dir(dir)
            .await
            .map_err(|e| format!("Failed to delete remote directory {}: {}", dir, e))?;
    }
    Ok(())
}

fn collect_local_entries(
    base: &Path,
    rel: &Path,
    dirs: &mut Vec<String>,
    files: &mut Vec<(PathBuf, String)>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(base.join(rel))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.as_os_str().is_empty() {
            PathBuf::from(&name)
        } else {
            rel.join(&name)
        };
        let rel_str = child_rel.to_string_lossy().replace('\\', "/");
        if entry.file_type()?.is_dir() {
            dirs.push(rel_str);
            collect_local_entries(base, &child_rel, dirs, files)?;
        } else {
            files.push((entry.path(), rel_str));
        }
    }
    Ok(())
}

pub async fn upload_dir(
    sftp: &SftpSession,
    local_dir: &Path,
    remote_dir: &str,
) -> Result<(), String> {
    let mut dirs: Vec<String> = Vec::new();
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    collect_local_entries(local_dir, Path::new(""), &mut dirs, &mut files)
        .map_err(|e| format!("Failed to read local directory {}: {}", local_dir.display(), e))?;

    let remote_base = remote_dir.trim_end_matches('/');
    remote_create_dir_all(sftp, remote_base).await?;

    // Parent directories are collected before children, so plain iteration is safe.
    for dir in &dirs {
        let remote_path = format!("{}/{}", remote_base, dir);
        if let Err(e) = sftp.create_dir(&remote_path).await {
            if !remote_exists(sftp, &remote_path).await {
                return Err(format!("Failed to create remote directory {}: {}", remote_path, e));
            }
        }
    }

    for (local_path, rel) in &files {
        let data = fs::read(local_path)
            .map_err(|e| format!("Failed to read local file {}: {}", local_path.display(), e))?;
        let remote_path = format!("{}/{}", remote_base, rel);
        let mut remote_file = sftp
            .create(&remote_path)
            .await
            .map_err(|e| format!("Failed to create remote file {}: {}", remote_path, e))?;
        remote_file
            .write_all(&data)
            .await
            .map_err(|e| format!("Failed to write remote file {}: {}", remote_path, e))?;
        remote_file
            .shutdown()
            .await
            .map_err(|e| format!("Failed to flush remote file {}: {}", remote_path, e))?;
    }
    Ok(())
}

pub async fn install_skill_to_remote(
    remote: &RemoteInfo,
    target_base: &str,
    skill_name: &str,
    source_dir: &Path,
) -> Result<(), String> {
    let (session, sftp) = connect_sftp(remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, target_base).await?;
        remote_create_dir_all(&sftp, &base).await?;
        let dest = format!("{}/{}", base.trim_end_matches('/'), skill_name);
        remote_remove_dir_all(&sftp, &dest).await?;
        upload_dir(&sftp, source_dir, &dest).await
    }
    .await;

    close_connection(session, sftp).await;
    result
}

#[tauri::command]
pub async fn save_ssh_password(
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<(), String> {
    let entry = keyring_entry(&host, port, &username)?;
    entry
        .set_password(&password)
        .map_err(|e| format!("Failed to save password to system credential store: {}", e))
}

#[tauri::command]
pub async fn delete_ssh_password(host: String, port: u16, username: String) -> Result<(), String> {
    let entry = keyring_entry(&host, port, &username)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete saved password: {}", e)),
    }
}

#[derive(Serialize)]
pub struct RemoteSkillInfo {
    pub name: String,
    pub description: Option<String>,
}

async fn read_remote_file_bytes(sftp: &SftpSession, path: &str) -> Option<Vec<u8>> {
    let mut file = sftp.open(path).await.ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).await.ok()?;
    Some(buf)
}

async fn read_remote_file(sftp: &SftpSession, path: &str) -> Option<String> {
    let buf = read_remote_file_bytes(sftp, path).await?;
    Some(String::from_utf8_lossy(&buf).to_string())
}

/// Recursively download a remote directory to a local path (iterative walk,
/// avoids async recursion).
async fn download_dir(
    sftp: &SftpSession,
    remote_dir: &str,
    local_dir: &Path,
) -> Result<(), String> {
    let mut pending = vec![(remote_dir.to_string(), local_dir.to_path_buf())];

    while let Some((rdir, ldir)) = pending.pop() {
        fs::create_dir_all(&ldir)
            .map_err(|e| format!("Failed to create local directory {}: {}", ldir.display(), e))?;

        let entries = sftp
            .read_dir(&rdir)
            .await
            .map_err(|e| format!("Failed to read remote directory {}: {}", rdir, e))?;

        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let rchild = format!("{}/{}", rdir.trim_end_matches('/'), name);
            let lchild = ldir.join(&name);
            if entry.file_type().is_dir() {
                pending.push((rchild, lchild));
            } else {
                let content = read_remote_file_bytes(sftp, &rchild)
                    .await
                    .ok_or_else(|| format!("Failed to read remote file {}", rchild))?;
                fs::write(&lchild, content)
                    .map_err(|e| format!("Failed to write local file {}: {}", lchild.display(), e))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn import_remote_skill(
    data_path: String,
    remote: RemoteInfo,
    remote_path: String,
    skill_name: String,
) -> Result<String, String> {
    let skills_dir = Path::new(&data_path).join("my_skills");
    let dest = skills_dir.join(&skill_name);
    if dest.exists() {
        return Err(format!("Skill '{}' already exists in my_skills directory.", skill_name));
    }
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let (session, sftp) = connect_sftp(&remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, &remote_path).await?;
        let src = format!("{}/{}", base.trim_end_matches('/'), skill_name);
        if !remote_exists(&sftp, &src).await {
            return Err(format!("Remote skill directory does not exist: {}", src));
        }
        download_dir(&sftp, &src, &dest).await
    }
    .await;

    close_connection(session, sftp).await;

    match result {
        Ok(()) => Ok(format!("Successfully imported skill {}", skill_name)),
        Err(e) => {
            // Clean up a partially downloaded skill so a retry starts fresh
            let _ = fs::remove_dir_all(&dest);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn list_remote_skills(
    remote: RemoteInfo,
    remote_path: String,
) -> Result<Vec<RemoteSkillInfo>, String> {
    let (session, sftp) = connect_sftp(&remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, &remote_path).await?;
        if !remote_exists(&sftp, &base).await {
            // Directory not created yet — report as empty rather than erroring
            return Ok(Vec::new());
        }

        let entries = sftp
            .read_dir(&base)
            .await
            .map_err(|e| format!("Failed to read remote directory {}: {}", base, e))?;

        let mut skills = Vec::new();
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." || name.starts_with('.') {
                continue;
            }
            if !entry.file_type().is_dir() {
                continue;
            }
            let md_path = format!("{}/{}/SKILL.md", base.trim_end_matches('/'), name);
            let description = read_remote_file(&sftp, &md_path)
                .await
                .and_then(|content| crate::extract_description(&content));
            skills.push(RemoteSkillInfo { name, description });
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }
    .await;

    close_connection(session, sftp).await;
    result
}

#[tauri::command]
pub async fn test_ssh_connection(
    remote: RemoteInfo,
    remote_path: String,
    password: Option<String>,
) -> Result<String, String> {
    let (session, sftp) = connect_sftp(&remote, password.as_deref()).await?;

    let result = async {
        let expanded = expand_remote_path(&sftp, &remote_path).await?;
        Ok::<(String, bool), String>((expanded.clone(), remote_exists(&sftp, &expanded).await))
    }
    .await;

    close_connection(session, sftp).await;

    let (expanded, exists) = result?;
    if exists {
        Ok(format!("连接成功，远程目录已存在：{}", expanded))
    } else {
        Ok(format!("连接成功，远程目录不存在（同步时将自动创建）：{}", expanded))
    }
}
