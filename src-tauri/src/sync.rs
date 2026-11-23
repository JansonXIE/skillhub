//! Skill directory fingerprinting and the sync-state baseline used to tell
//! "the library is authoritative" apart from "someone edited it on a server".
//!
//! Every skill directory is reduced to a single hash: the recursive list of
//! `relative path + file bytes`, sorted. Two directories hash equal only if
//! they contain the same files with the same contents. `sync_state.json`
//! records the hash each server had the last time we successfully pushed or
//! pulled, which is what lets us detect that a side changed behind our back.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::ssh;

/// FNV-1a 64-bit. Fast, dependency-free, and good enough to detect changed
/// files — this is a change detector, not a security primitive.
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

fn fnv1a(bytes: &[u8], mut hash: u64) -> u64 {
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// Directories/artifacts that are noise for sync purposes. Mirrored on the
/// remote walk so both sides see the same file set.
fn is_ignored_component(name: &str) -> bool {
    matches!(name, ".git" | ".svn" | ".hg" | ".DS_Store" | "Thumbs.db")
}

/// Hash a skill directory on the local filesystem.
pub fn hash_local_dir(dir: &Path) -> Result<String, String> {
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();

    fn walk(
        base: &Path,
        rel: &Path,
        entries: &mut Vec<(String, Vec<u8>)>,
    ) -> Result<(), String> {
        let read = fs::read_dir(if rel.as_os_str().is_empty() {
            base.to_path_buf()
        } else {
            base.join(rel)
        })
        .map_err(|e| format!("Failed to read directory {}: {}", base.join(rel).display(), e))?;

        for entry in read {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            if is_ignored_component(&name) {
                continue;
            }

            let child_rel = if rel.as_os_str().is_empty() {
                PathBuf::from(&name)
            } else {
                rel.join(&name)
            };

            // `file_type()` does not follow symlinks, so links hash as files.
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                walk(base, &child_rel, entries)?;
            } else {
                let path = base.join(&child_rel);
                let bytes = fs::read(&path).map_err(|e| {
                    format!("Failed to read file {}: {}", path.display(), e)
                })?;
                entries.push((normalize_rel(&child_rel), bytes));
            }
        }
        Ok(())
    }

    walk(dir, Path::new(""), &mut entries)?;
    Ok(fingerprint(entries))
}

/// Same fingerprint, computed over a remote directory fetched over SFTP.
pub async fn hash_remote_dir(
    sftp: &russh_sftp::client::SftpSession,
    remote_dir: &str,
) -> Result<String, String> {
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut pending = vec![(remote_dir.to_string(), String::new())];

    while let Some((rdir, rel_base)) = pending.pop() {
        let listing = sftp
            .read_dir(&rdir)
            .await
            .map_err(|e| format!("Failed to read remote directory {}: {}", rdir, e))?;

        for entry in listing {
            let name = entry.file_name();
            if name == "." || name == ".." || is_ignored_component(&name) {
                continue;
            }

            let rel = if rel_base.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel_base, name)
            };
            let rpath = format!("{}/{}", rdir.trim_end_matches('/'), name);

            if entry.file_type().is_dir() {
                pending.push((rpath, rel));
            } else {
                let bytes = ssh::read_remote_file_bytes(sftp, &rpath)
                    .await
                    .ok_or_else(|| format!("Failed to read remote file {}", rpath))?;
                entries.push((rel, bytes));
            }
        }
    }

    Ok(fingerprint(entries))
}

/// Windows separators are normalized so a skill hashed locally matches the
/// same skill hashed on a Linux server.
fn normalize_rel(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn fingerprint(mut entries: Vec<(String, Vec<u8>)>) -> String {
    // Rust's String Ord is byte-wise, so this ordering is identical on every
    // platform — required for local and remote hashes to be comparable.
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut hash = FNV_OFFSET;
    for (rel, bytes) in &entries {
        hash = fnv1a(rel.as_bytes(), hash);
        hash = fnv1a(&[0u8], hash);
        hash = fnv1a(bytes, hash);
        hash = fnv1a(&[0xffu8], hash);
    }

    format!("{:016x}", hash)
}

// ---------------------------------------------------------------------------
// Sync state baseline
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PlatformBaseline {
    /// Fingerprint of the skill as it existed on the server after the last
    /// successful sync in either direction.
    pub hash: String,
    /// Unix seconds.
    #[serde(rename = "syncedAt")]
    pub synced_at: u64,
}

/// skill name -> platform id -> baseline
pub type SyncState = BTreeMap<String, BTreeMap<String, PlatformBaseline>>;

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn state_path(data_path: &str) -> PathBuf {
    Path::new(data_path).join("sync_state.json")
}

/// A missing or unreadable state file is treated as "no baselines yet" rather
/// than an error: losing it only costs an extra confirmation prompt.
pub fn load_state(data_path: &str) -> SyncState {
    let path = state_path(data_path);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
            log::warn!("Ignoring malformed {}: {}", path.display(), e);
            SyncState::new()
        }),
        Err(_) => SyncState::new(),
    }
}

pub fn save_state(data_path: &str, state: &SyncState) -> Result<(), String> {
    let path = state_path(data_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize sync state: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

pub fn record_baseline(
    data_path: &str,
    skill_name: &str,
    platform_id: &str,
    hash: &str,
) -> Result<(), String> {
    let mut state = load_state(data_path);
    state
        .entry(skill_name.to_string())
        .or_default()
        .insert(
            platform_id.to_string(),
            PlatformBaseline {
                hash: hash.to_string(),
                synced_at: now_secs(),
            },
        );
    save_state(data_path, &state)
}

pub fn forget_skill(data_path: &str, skill_name: &str) {
    let mut state = load_state(data_path);
    if state.remove(skill_name).is_some() {
        let _ = save_state(data_path, &state);
    }
}

// ---------------------------------------------------------------------------
// Three-way comparison
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncStatus {
    /// The skill does not exist in the local library yet.
    NotImported,
    /// No baseline on record: this skill/platform pair has never been synced.
    NoBaseline,
    /// Local and remote already match.
    InSync,
    /// Only the server changed since the last sync — safe to pull quietly.
    RemoteUpdated,
    /// Only the local library changed — pulling would discard local work.
    LocalUpdated,
    /// Both sides changed since the last sync — the user must choose.
    Conflict,
}

pub fn decide(
    local_hash: &str,
    remote_hash: &str,
    baseline: Option<&PlatformBaseline>,
) -> SyncStatus {
    if local_hash == remote_hash {
        return SyncStatus::InSync;
    }
    match baseline {
        None => SyncStatus::NoBaseline,
        Some(base) => {
            let local_changed = base.hash != local_hash;
            let remote_changed = base.hash != remote_hash;
            match (local_changed, remote_changed) {
                (false, false) => SyncStatus::InSync, // unreachable: hashes differ
                (false, true) => SyncStatus::RemoteUpdated,
                (true, false) => SyncStatus::LocalUpdated,
                (true, true) => SyncStatus::Conflict,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pull / push helpers
// ---------------------------------------------------------------------------

/// Name to pull into when the user does not want to overwrite the local copy:
/// `gerrit-submit` + server A becomes `gerrit-submit@serverA`, then
/// `...@serverA-2` and so on if those exist too.
pub fn variant_name(skills_dir: &Path, skill_name: &str, tag: &str) -> String {
    let safe_tag: String = tag
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    let base = format!("{}@{}", skill_name, safe_tag);

    if !skills_dir.join(&base).exists() {
        return base;
    }
    for n in 2..1000 {
        let candidate = format!("{}-{}", base, n);
        if !skills_dir.join(&candidate).exists() {
            return candidate;
        }
    }
    format!("{}-{}", base, now_secs())
}

/// Copy an existing skill directory into `data_path/skill_backups/` before it
/// is overwritten. Returns the backup path.
///
/// Backups deliberately live outside `my_skills/`: `get_local_skills` lists
/// every subdirectory there, hidden ones included, so a backup in that tree
/// would show up as a bogus skill.
fn backup_dir(data_path: &str, skill_dir: &Path) -> Result<PathBuf, String> {
    let name = skill_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "skill".to_string());
    let stamp = now_secs();
    let backups_root = Path::new(data_path).join("skill_backups");
    fs::create_dir_all(&backups_root)
        .map_err(|e| format!("Failed to create {}: {}", backups_root.display(), e))?;

    let mut target = backups_root.join(format!("{}-{}", name, stamp));
    let mut n = 2;
    while target.exists() {
        target = backups_root.join(format!("{}-{}-{}", name, stamp, n));
        n += 1;
    }

    crate::copy_dir_all(skill_dir, &target)
        .map_err(|e| format!("Failed to back up {}: {}", skill_dir.display(), e))?;
    Ok(target)
}

/// Moves an existing skill directory into `data_path/skill_backups/` before it
/// is overwritten, returning the backup path.
///
/// Callers restore() it if the replacement fails, so a broken download never
/// leaves the library with a half-written skill and no working one.
pub fn backup_and_remove(data_path: &str, skill_dir: &Path) -> Result<PathBuf, String> {
    let backup = backup_dir(data_path, skill_dir)?;
    fs::remove_dir_all(skill_dir)
        .map_err(|e| format!("Failed to remove {}: {}", skill_dir.display(), e))?;
    Ok(backup)
}

pub fn restore_backup(backup: &Path, skill_dir: &Path) {
    let _ = fs::remove_dir_all(skill_dir);
    let _ = crate::copy_dir_all(backup, skill_dir);
}


#[cfg(test)]
mod tests {
    use super::*;

    fn base(hash: &str) -> PlatformBaseline {
        PlatformBaseline {
            hash: hash.to_string(),
            synced_at: 0,
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("skillhub-sync-test-{}-{}", name, now_secs()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(root: &Path, rel: &str, content: &str) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn fingerprint_is_order_independent() {
        let a = fingerprint(vec![
            ("b.md".into(), b"two".to_vec()),
            ("a.md".into(), b"one".to_vec()),
        ]);
        let b = fingerprint(vec![
            ("a.md".into(), b"one".to_vec()),
            ("b.md".into(), b"two".to_vec()),
        ]);
        assert_eq!(a, b);
    }

    #[test]
    fn fingerprint_changes_with_content_and_name() {
        let base = fingerprint(vec![("a.md".into(), b"one".to_vec())]);
        assert_ne!(base, fingerprint(vec![("a.md".into(), b"two".to_vec())]));
        assert_ne!(base, fingerprint(vec![("b.md".into(), b"one".to_vec())]));
        assert_ne!(
            base,
            fingerprint(vec![
                ("a.md".into(), b"one".to_vec()),
                ("extra.md".into(), b"".to_vec()),
            ])
        );
    }

    #[test]
    fn empty_dir_has_stable_hash() {
        assert_eq!(fingerprint(vec![]), fingerprint(vec![]));
    }

    #[test]
    fn local_hash_matches_hand_built_entries() {
        // The remote walker builds the same (relative path, bytes) pairs, so
        // both sides must reduce to this exact fingerprint.
        let dir = temp_dir("parity");
        write(&dir, "SKILL.md", "---\ndescription: hi\n---\n");
        write(&dir, "scripts/run.sh", "echo hi\n");

        let expected = fingerprint(vec![
            (
                "SKILL.md".into(),
                "---\ndescription: hi\n---\n".as_bytes().to_vec(),
            ),
            ("scripts/run.sh".into(), b"echo hi\n".to_vec()),
        ]);

        assert_eq!(hash_local_dir(&dir).unwrap(), expected);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn local_hash_ignores_vcs_and_os_noise() {
        let dir = temp_dir("ignored");
        write(&dir, "SKILL.md", "body");
        let clean = hash_local_dir(&dir).unwrap();

        write(&dir, ".git/config", "[core]");
        write(&dir, ".DS_Store", "junk");
        assert_eq!(hash_local_dir(&dir).unwrap(), clean);

        // A real content change still moves the hash.
        write(&dir, "SKILL.md", "body2");
        assert_ne!(hash_local_dir(&dir).unwrap(), clean);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn decide_follows_the_three_way_table() {
        use SyncStatus::*;
        let b = base("old");

        // equal on both sides
        assert_eq!(decide("a", "a", None), InSync);
        assert_eq!(decide("a", "a", Some(&b)), InSync);

        // no baseline recorded yet
        assert_eq!(decide("local", "remote", None), NoBaseline);

        // only the server moved
        assert_eq!(decide("old", "new", Some(&b)), RemoteUpdated);

        // only the library moved
        assert_eq!(decide("new", "old", Some(&b)), LocalUpdated);

        // both moved, and to different contents
        assert_eq!(decide("new1", "new2", Some(&b)), Conflict);

        // both moved to the *same* content is still in sync
        assert_eq!(decide("new", "new", Some(&b)), InSync);
    }

    #[test]
    fn variant_name_avoids_collisions() {
        let dir = temp_dir("variant");
        let skills = dir.join("my_skills");
        fs::create_dir_all(&skills).unwrap();

        assert_eq!(variant_name(&skills, "gerrit-submit", "serverA"), "gerrit-submit@serverA");

        fs::create_dir_all(skills.join("gerrit-submit@serverA")).unwrap();
        assert_eq!(
            variant_name(&skills, "gerrit-submit", "serverA"),
            "gerrit-submit@serverA-2"
        );

        // Characters that are awkward in a path are flattened.
        assert_eq!(
            variant_name(&skills, "gerrit-submit", "10.0.0.5:22"),
            "gerrit-submit@10_0_0_5_22"
        );

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn state_round_trips_and_survives_corruption() {
        let dir = temp_dir("state");
        let data = dir.to_string_lossy().to_string();

        assert!(load_state(&data).is_empty());
        record_baseline(&data, "gerrit-submit", "remote-directory-1", "abc").unwrap();

        let state = load_state(&data);
        assert_eq!(state["gerrit-submit"]["remote-directory-1"].hash, "abc");
        assert!(state["gerrit-submit"]["remote-directory-1"].synced_at > 0);

        // A corrupt file degrades to "no baselines" instead of failing.
        fs::write(state_path(&data), "{not json").unwrap();
        assert!(load_state(&data).is_empty());

        record_baseline(&data, "gerrit-submit", "remote-directory-1", "abc").unwrap();
        forget_skill(&data, "gerrit-submit");
        assert!(load_state(&data).is_empty());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn state_file_matches_documented_shape() {
        // skill name -> platform id -> { hash, syncedAt }
        let dir = temp_dir("shape");
        let data = dir.to_string_lossy().to_string();
        record_baseline(&data, "gerrit-submit", "remote-directory-1", "abc").unwrap();

        let raw: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(state_path(&data)).unwrap()).unwrap();

        let entry = &raw["gerrit-submit"]["remote-directory-1"];
        assert_eq!(entry["hash"], "abc");
        assert!(entry["syncedAt"].as_u64().unwrap() > 0);

        fs::remove_dir_all(&dir).ok();
    }
}

