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

/// Push a local skill directory to a remote base directory.
///
/// When `baseline_hash` is known and `force` is false, the server copy is
/// fingerprinted first: if it no longer matches what we last synced, someone
/// edited the skill directly on the server and overwriting would destroy that
/// work — so we refuse instead.
pub async fn install_skill_to_remote(
    remote: &RemoteInfo,
    target_base: &str,
    skill_name: &str,
    source_dir: &Path,
    baseline_hash: Option<&str>,
    force: bool,
) -> Result<(), String> {
    let (session, sftp) = connect_sftp(remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, target_base).await?;
        remote_create_dir_all(&sftp, &base).await?;
        let dest = format!("{}/{}", base.trim_end_matches('/'), skill_name);

        if !force {
            if let Some(expected) = baseline_hash {
                if remote_exists(&sftp, &dest).await {
                    let current = crate::sync::hash_remote_dir(&sftp, &dest).await?;
                    if current != expected {
                        return Err(format!(
                            "服务器上的「{}」自上次同步后已被修改，继续推送会覆盖这些改动",
                            dest
                        ));
                    }
                }
            }
        }

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

pub(crate) async fn read_remote_file_bytes(sftp: &SftpSession, path: &str) -> Option<Vec<u8>> {
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

#[derive(Serialize)]
pub struct ImportOutcome {
    pub status: crate::sync::SyncStatus,
    /// Name the skill ended up under — differs from `skill_name` on save-as-new.
    pub skill_name: String,
    pub message: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PullMode {
    /// Refuse when the destination exists.
    Refuse,
    /// Replace the local copy, keeping a timestamped backup.
    Overwrite,
    /// Download alongside as `<name>@<tag>`.
    SaveAsNew,
}

fn parse_pull_mode(mode: &str) -> PullMode {
    match mode {
        "overwrite" => PullMode::Overwrite,
        "saveAsNew" => PullMode::SaveAsNew,
        _ => PullMode::Refuse,
    }
}

/// Pull a skill from a server into `my_skills/`, with three-way conflict
/// handling against the sync baseline.
///
/// - only the server changed  -> pulled automatically, no prompt
/// - only we changed          -> refused unless `mode` is overwrite/saveAsNew
/// - both changed             -> the caller has to pick a mode explicitly
/// - never synced before      -> same as both-changed; ask, do not guess
#[tauri::command]
pub async fn import_remote_skill(
    data_path: String,
    remote: RemoteInfo,
    remote_path: String,
    skill_name: String,
    platform_id: String,
    mode: String,
    variant_tag: String,
) -> Result<ImportOutcome, String> {
    let skills_dir = Path::new(&data_path).join("my_skills");
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let dest = skills_dir.join(&skill_name);
    let mode = parse_pull_mode(&mode);

    let (session, sftp) = connect_sftp(&remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, &remote_path).await?;
        let src = format!("{}/{}", base.trim_end_matches('/'), skill_name);
        if !remote_exists(&sftp, &src).await {
            return Err(format!("Remote skill directory does not exist: {}", src));
        }

        let remote_hash = crate::sync::hash_remote_dir(&sftp, &src).await?;
        let baseline = crate::sync::load_state(&data_path)
            .get(&skill_name)
            .and_then(|platforms| platforms.get(&platform_id))
            .cloned();

        // `None` means the skill is not in the library at all yet.
        let local_hash = if dest.exists() {
            Some(crate::sync::hash_local_dir(&dest)?)
        } else {
            None
        };

        let status = match local_hash.as_deref() {
            None => crate::sync::SyncStatus::NotImported,
            Some(local) => crate::sync::decide(local, &remote_hash, baseline.as_ref()),
        };

        let target_name = match status {
            crate::sync::SyncStatus::NotImported => skill_name.clone(),

            // Nothing to transfer, but make sure a baseline exists for next time.
            crate::sync::SyncStatus::InSync => {
                if !platform_id.is_empty() {
                    crate::sync::record_baseline(
                        &data_path,
                        &skill_name,
                        &platform_id,
                        &remote_hash,
                    )?;
                }
                return Ok(ImportOutcome {
                    status,
                    skill_name: skill_name.clone(),
                    message: format!("「{}」已是最新，无需导入。", skill_name),
                });
            }

            // Only the server moved since we last synced the two sides.
            crate::sync::SyncStatus::RemoteUpdated => skill_name.clone(),

            crate::sync::SyncStatus::NoBaseline
            | crate::sync::SyncStatus::LocalUpdated
            | crate::sync::SyncStatus::Conflict => match mode {
                PullMode::Overwrite => skill_name.clone(),
                PullMode::SaveAsNew => {
                    let tag = if variant_tag.trim().is_empty() {
                        "remote".to_string()
                    } else {
                        variant_tag.trim().to_string()
                    };
                    crate::sync::variant_name(&skills_dir, &skill_name, &tag)
                }
                PullMode::Refuse => {
                    return Err(match status {
                        crate::sync::SyncStatus::NoBaseline => format!(
                            "Skill '{}' already exists in my_skills directory.",
                            skill_name
                        ),
                        crate::sync::SyncStatus::LocalUpdated => format!(
                            "本地「{}」自上次同步后有过修改，拉取会覆盖这些改动。",
                            skill_name
                        ),
                        _ => format!(
                            "本地与服务器上的「{}」都有改动，存在冲突。",
                            skill_name
                        ),
                    })
                }
            },
        };

        let dest_dir = skills_dir.join(&target_name);
        let replaced = dest_dir.exists();
        let backup = if replaced {
            Some(crate::sync::backup_and_remove(&data_path, &dest_dir)?)
        } else {
            None
        };

        if let Err(e) = download_dir(&sftp, &src, &dest_dir).await {
            if let Some(backup) = &backup {
                crate::sync::restore_backup(backup, &dest_dir);
                return Err(format!("{}（已回滚到原版本）", e));
            }
            let _ = fs::remove_dir_all(&dest_dir);
            return Err(e);
        }

        if !platform_id.is_empty() {
            crate::sync::record_baseline(&data_path, &target_name, &platform_id, &remote_hash)?;
        }

        let message = if target_name != skill_name {
            format!("已将服务器上的「{}」另存为「{}」。", skill_name, target_name)
        } else if replaced {
            format!("已用服务器上的版本更新「{}」。", skill_name)
        } else {
            format!("已将「{}」导入到我的 Skills。", skill_name)
        };

        Ok(ImportOutcome {
            status,
            skill_name: target_name,
            message,
        })
    }
    .await;

    close_connection(session, sftp).await;
    result
}

/// Compare every skill on a server against the local library and the sync
/// baseline, so the UI can show what is stale instead of failing on click.
#[derive(Serialize)]
pub struct RemoteSkillOverview {
    pub name: String,
    pub description: Option<String>,
    pub status: crate::sync::SyncStatus,
    pub remote_hash: String,
    pub local_hash: Option<String>,
    pub last_synced_at: Option<u64>,
}

#[tauri::command]
pub async fn get_remote_sync_overview(
    data_path: String,
    remote: RemoteInfo,
    remote_path: String,
    platform_id: String,
) -> Result<Vec<RemoteSkillOverview>, String> {
    let (session, sftp) = connect_sftp(&remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, &remote_path).await?;
        if !remote_exists(&sftp, &base).await {
            return Ok(Vec::new());
        }

        let entries = sftp
            .read_dir(&base)
            .await
            .map_err(|e| format!("Failed to read remote directory {}: {}", base, e))?;

        let state = crate::sync::load_state(&data_path);
        let skills_dir = Path::new(&data_path).join("my_skills");
        let mut skills = Vec::new();

        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." || name.starts_with('.') {
                continue;
            }
            if !entry.file_type().is_dir() {
                continue;
            }

            let rdir = format!("{}/{}", base.trim_end_matches('/'), name);
            let remote_hash = crate::sync::hash_remote_dir(&sftp, &rdir).await?;

            let description = read_remote_file(&sftp, &format!("{}/SKILL.md", rdir))
                .await
                .and_then(|content| crate::extract_description(&content));

            let local_dir = skills_dir.join(&name);
            let local_hash = if local_dir.exists() {
                crate::sync::hash_local_dir(&local_dir).ok()
            } else {
                None
            };

            let baseline = state.get(&name).and_then(|p| p.get(&platform_id));
            let status = match local_hash.as_deref() {
                None => crate::sync::SyncStatus::NotImported,
                Some(local) => crate::sync::decide(local, &remote_hash, baseline),
            };

            skills.push(RemoteSkillOverview {
                name,
                description,
                status,
                remote_hash,
                local_hash,
                last_synced_at: baseline.map(|b| b.synced_at),
            });
        }

        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }
    .await;

    close_connection(session, sftp).await;
    result
}

#[derive(Serialize)]
pub struct PushDrift {
    pub platform_id: String,
    pub skill_name: String,
}

/// Pre-flight for a push: report every (skill, remote platform) whose server
/// copy has diverged from the last synced baseline. The caller confirms, then
/// re-runs the push with `force`.
///
/// Connection failures are skipped here — the push itself reports them.
#[tauri::command]
pub async fn check_push_drift(
    data_path: String,
    skill_names: Vec<String>,
    targets: Vec<crate::InstallTarget>,
) -> Result<Vec<PushDrift>, String> {
    let state = crate::sync::load_state(&data_path);
    let mut drifts = Vec::new();

    for target in targets.iter().filter(|t| t.remote.is_some()) {
        let Some(remote) = target.remote.as_ref() else {
            continue;
        };
        let Ok((session, sftp)) = connect_sftp(remote, None).await else {
            continue;
        };

        if let Ok(base) = expand_remote_path(&sftp, &target.target_path).await {
            for skill_name in &skill_names {
                let Some(baseline) = state
                    .get(skill_name)
                    .and_then(|platforms| platforms.get(&target.platform_id))
                else {
                    continue; // never synced here: nothing to have drifted from
                };

                let rdir = format!("{}/{}", base.trim_end_matches('/'), skill_name);
                if !remote_exists(&sftp, &rdir).await {
                    continue; // gone from the server: a push is a fresh install
                }

                if let Ok(current) = crate::sync::hash_remote_dir(&sftp, &rdir).await {
                    if current != baseline.hash {
                        drifts.push(PushDrift {
                            platform_id: target.platform_id.clone(),
                            skill_name: skill_name.clone(),
                        });
                    }
                }
            }
        }

        close_connection(session, sftp).await;
    }

    Ok(drifts)
}

/// Guard against a skill name that would escape the skills base directory.
fn validate_skill_name(skill_name: &str) -> Result<(), String> {
    let trimmed = skill_name.trim();
    if trimmed.is_empty() {
        return Err("Skill name is empty".to_string());
    }
    if trimmed == "." || trimmed == ".." || trimmed.starts_with('.') {
        return Err(format!("Invalid skill name: {}", skill_name));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(format!("Invalid skill name: {}", skill_name));
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_remote_skill(
    remote: RemoteInfo,
    remote_path: String,
    skill_name: String,
) -> Result<String, String> {
    validate_skill_name(&skill_name)?;

    let (session, sftp) = connect_sftp(&remote, None).await?;

    let result = async {
        let base = expand_remote_path(&sftp, &remote_path).await?;
        let target = format!("{}/{}", base.trim_end_matches('/'), skill_name);
        if !remote_exists(&sftp, &target).await {
            return Err(format!("Remote skill directory does not exist: {}", target));
        }
        remote_remove_dir_all(&sftp, &target).await?;
        Ok(format!("Successfully deleted remote skill {}", skill_name))
    }
    .await;

    close_connection(session, sftp).await;
    result
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
