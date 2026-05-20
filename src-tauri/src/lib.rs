use std::process::Command;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};


#[derive(Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct InstallTarget {
    pub platform_id: String,
    pub target_path: String,
}

#[tauri::command]
async fn clone_github_repo(url: String, base_path: String) -> Result<String, String> {
    // Basic validation
    if !url.starts_with("http") {
        return Err("URL must start with http or https".to_string());
    }

    // Extract repo name from URL
    let repo_name = url.split('/').last().unwrap_or("unknown_skill");
    let repo_name = repo_name.trim_end_matches(".git");

    // Ensure the `my_skills` directory exists within base_path
    let skills_dir = Path::new(&base_path).join("my_skills");
    if !skills_dir.exists() {
        if let Err(e) = fs::create_dir_all(&skills_dir) {
            return Err(format!("Failed to create skills directory: {}", e));
        }
    }

    // Destination path
    let dest_path = skills_dir.join(repo_name);
    
    if dest_path.exists() {
        return Err(format!("Skill '{}' already exists in the my_skills directory.", repo_name));
    }

    // Run git clone
    let output = Command::new("git")
        .args(["clone", &url, dest_path.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git clone failed: {}", err_msg));
    }

    Ok(format!("Successfully cloned {} to {}", repo_name, dest_path.display()))
}

#[tauri::command]
async fn get_local_skills(data_path: String) -> Result<Vec<SkillInfo>, String> {
    let skills_dir = Path::new(&data_path).join("my_skills");
    let mut skills = Vec::new();

    if skills_dir.exists() {
        if let Ok(entries) = fs::read_dir(skills_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = entry.file_name().into_string().unwrap_or_default();
                        
                        // Try to read description from SKILL.md
                        let mut description = None;
                        let skill_md_path = entry.path().join("SKILL.md");
                        if let Ok(content) = fs::read_to_string(&skill_md_path) {
                            for line in content.lines() {
                                if let Some(desc) = line.strip_prefix("description:") {
                                    description = Some(desc.trim().to_string());
                                    break;
                                } else if let Some(desc) = line.strip_prefix("description：") { // handle chinese colon
                                    description = Some(desc.trim().to_string());
                                    break;
                                }
                            }
                            
                            // If no "description:" found, maybe just take the first non-empty line
                            if description.is_none() {
                                for line in content.lines() {
                                    let trimmed = line.trim();
                                    if !trimmed.is_empty() && !trimmed.starts_with('#') {
                                        description = Some(trimmed.to_string());
                                        break;
                                    }
                                }
                            }
                        }
                        
                        skills.push(SkillInfo {
                            name,
                            description,
                        });
                    }
                }
            }
        }
    }
    
    
    Ok(skills)
}

#[tauri::command]
async fn get_skill_detail(data_path: String, skill_name: String) -> Result<String, String> {
    let skill_md_path = Path::new(&data_path)
        .join("my_skills")
        .join(&skill_name)
        .join("SKILL.md");

    if !skill_md_path.exists() {
        return Err(format!("SKILL.md not found for skill '{}'", skill_name));
    }

    match fs::read_to_string(&skill_md_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read SKILL.md: {}", e)),
    }
}

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn create_local_skill(data_path: String, skill_name: String, content: String) -> Result<String, String> {
    let skills_dir = Path::new(&data_path).join("my_skills");
    if !skills_dir.exists() {
        if let Err(e) = fs::create_dir_all(&skills_dir) {
            return Err(format!("Failed to create skills directory: {}", e));
        }
    }

    let dest_path = skills_dir.join(&skill_name);
    if dest_path.exists() {
        return Err(format!("Skill '{}' already exists.", skill_name));
    }

    if let Err(e) = fs::create_dir_all(&dest_path) {
        return Err(format!("Failed to create skill directory: {}", e));
    }

    let md_path = dest_path.join("SKILL.md");
    if let Err(e) = fs::write(&md_path, content) {
        return Err(format!("Failed to write SKILL.md: {}", e));
    }

    Ok(format!("Successfully created skill {}", skill_name))
}

#[tauri::command]
async fn import_local_skill(data_path: String, source_path: String) -> Result<String, String> {
    let src_path = Path::new(&source_path);
    if !src_path.exists() || !src_path.is_dir() {
        return Err("Source path is invalid or not a directory".to_string());
    }

    // Check if SKILL.md or README.md exists
    let has_skill_md = src_path.join("SKILL.md").exists();
    let has_readme_md = src_path.join("README.md").exists();
    if !has_skill_md && !has_readme_md {
        return Err("Directory must contain SKILL.md or README.md".to_string());
    }

    let dir_name = src_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    if dir_name.is_empty() {
        return Err("Invalid source directory name".to_string());
    }

    let skills_dir = Path::new(&data_path).join("my_skills");
    if !skills_dir.exists() {
        if let Err(e) = fs::create_dir_all(&skills_dir) {
            return Err(format!("Failed to create skills directory: {}", e));
        }
    }

    let dest_path = skills_dir.join(&dir_name);
    if dest_path.exists() {
        return Err(format!("Skill '{}' already exists in my_skills directory.", dir_name));
    }

    match copy_dir_all(src_path, &dest_path) {
        Ok(_) => Ok(format!("Successfully imported skill {}", dir_name)),
        Err(e) => Err(format!("Failed to copy directory: {}", e))
    }
}

#[tauri::command]
async fn delete_local_skill(data_path: String, skill_name: String) -> Result<String, String> {
    let skill_dir = Path::new(&data_path).join("my_skills").join(&skill_name);
    if !skill_dir.exists() {
        return Err(format!("Skill '{}' does not exist.", skill_name));
    }

    if let Err(e) = fs::remove_dir_all(&skill_dir) {
        return Err(format!("Failed to delete skill directory: {}", e));
    }

    Ok(format!("Successfully deleted skill {}", skill_name))
}

fn expand_env_vars(path: &str) -> String {
    let mut expanded = path.to_string();
    if expanded.contains("%USERPROFILE%") {
        if let Ok(home) = std::env::var("USERPROFILE") {
            expanded = expanded.replace("%USERPROFILE%", &home);
        }
    }
    expanded
}

#[tauri::command]
async fn batch_install_skill(data_path: String, skill_name: String, targets: Vec<InstallTarget>) -> Result<String, String> {
    let source_dir = Path::new(&data_path).join("my_skills").join(&skill_name);
    if !source_dir.exists() {
        return Err(format!("Source skill directory does not exist: {}", source_dir.display()));
    }

    let mut success_count = 0;
    let mut errors = Vec::new();

    for target in targets {
        let expanded_path = expand_env_vars(&target.target_path);
        let dest_base = Path::new(&expanded_path);
        let dest_dir = dest_base.join(&skill_name);

        // Ensure target base directory exists
        if !dest_base.exists() {
            if let Err(e) = fs::create_dir_all(&dest_base) {
                errors.push(format!("{}: failed to create target dir: {}", target.platform_id, e));
                continue;
            }
        }

        // Copy directory
        if dest_dir.exists() {
            if let Err(e) = fs::remove_dir_all(&dest_dir) {
                errors.push(format!("{}: failed to remove existing dir: {}", target.platform_id, e));
                continue;
            }
        }

        match copy_dir_all(&source_dir, &dest_dir) {
            Ok(_) => success_count += 1,
            Err(e) => errors.push(format!("{}: failed to copy: {}", target.platform_id, e)),
        }
    }

    if errors.is_empty() {
        Ok(format!("Successfully installed to {} platforms.", success_count))
    } else {
        Err(format!("Installed to {} platforms. Errors: {}", success_count, errors.join("; ")))
    }
}


fn get_cache_dir() -> Result<std::path::PathBuf, String> {
    if let Ok(home) = std::env::var("USERPROFILE") {
        Ok(Path::new(&home).join(".github-skills-repo"))
    } else if let Ok(home) = std::env::var("HOME") {
        Ok(Path::new(&home).join(".github-skills-repo"))
    } else {
        Err("Could not find home directory".to_string())
    }
}

fn get_gerrit_cache_dir() -> Result<std::path::PathBuf, String> {
    if let Ok(home) = std::env::var("USERPROFILE") {
        Ok(Path::new(&home).join(".gerrit-skills-repo"))
    } else if let Ok(home) = std::env::var("HOME") {
        Ok(Path::new(&home).join(".gerrit-skills-repo"))
    } else {
        Err("Could not find home directory".to_string())
    }
}

fn run_git_cmd(args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    
    let output = cmd.output().map_err(|e| format!("Failed to execute git {:?}: {}", args, e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if !output.status.success() {
        return Err(format!("Git command failed: {}\n{}", args.join(" "), stderr));
    }
    Ok(stdout)
}

#[tauri::command]
async fn prepare_skill_commit(data_path: String, skill_name: String, repo_url: String, branch: String) -> Result<String, String> {
    let source_dir = Path::new(&data_path).join("my_skills").join(&skill_name);
    if !source_dir.exists() {
        return Err(format!("Local skill {} does not exist", skill_name));
    }

    let cache_dir = get_cache_dir()?;
    
    // 1. Init cache dir if not exists
    if !cache_dir.exists() {
        run_git_cmd(&["clone", "--filter=blob:none", "--sparse", &repo_url, cache_dir.to_str().unwrap()], None)?;
    }
    
    // 2. Pull latest
    run_git_cmd(&["pull", "origin", &branch], Some(&cache_dir))?;
    
    // 3. Sparse checkout add skill_name
    run_git_cmd(&["sparse-checkout", "add", &skill_name], Some(&cache_dir))?;
    
    // 4. Copy files
    let target_dir = cache_dir.join(&skill_name);
    if target_dir.exists() {
        if let Err(e) = fs::remove_dir_all(&target_dir) {
            return Err(format!("Failed to remove old target dir: {}", e));
        }
    }
    
    if let Err(e) = copy_dir_all(&source_dir, &target_dir) {
        return Err(format!("Failed to copy skill files: {}", e));
    }
    
    // Clean to ensure a fresh environment just in case
    run_git_cmd(&["reset", "--hard", &format!("origin/{}", branch)], Some(&cache_dir)).unwrap_or_default();
    
    // 5. Git add specific skill only
    run_git_cmd(&["add", "--all", &skill_name], Some(&cache_dir))?;
    
    // 6. Check status and get diff
    let status = run_git_cmd(&["status", "--porcelain", &skill_name], Some(&cache_dir))?;
    if status.trim().is_empty() {
        return Ok("".to_string()); // empty diff means no changes
    }
    
    // Return git diff --cached
    let diff = run_git_cmd(&["diff", "--cached"], Some(&cache_dir))?;
    Ok(diff)
}

#[tauri::command]
async fn commit_and_push_skill(repo_url: String, branch: String, commit_message: String) -> Result<String, String> {
    let _ = repo_url;
    let cache_dir = get_cache_dir()?;
    if !cache_dir.exists() {
        return Err("Cache dir not found, did you call prepare first?".to_string());
    }

    // 7. Git commit
    run_git_cmd(&["commit", "-m", &commit_message], Some(&cache_dir))?;
    
    // 8. Git push
    run_git_cmd(&["push", "origin", &branch], Some(&cache_dir))?;

    Ok("Successfully pushed".to_string())
}

#[tauri::command]
async fn install_gerrit_hook(repo_dir: String) -> Result<String, String> {
    let hook_path = Path::new(&repo_dir).join(".git").join("hooks").join("commit-msg");
    let host = "gerrit-ai.sophgo.vip";
    let port = "29418";
    let user = "jianxing.xie";

    let output = Command::new("scp")
        .args([
            "-p", "-P", port,
            &format!("{}@{}:hooks/commit-msg", user, host),
            hook_path.to_str().unwrap_or(""),
        ])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            // On Unix set executable; on Windows this is a no-op
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&hook_path, fs::Permissions::from_mode(0o755));
            }
            Ok("Gerrit commit-msg hook installed.".to_string())
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            // Non-fatal: return warning instead of error
            Ok(format!("Hook install skipped (can be ignored): {}", stderr.trim()))
        }
        Err(e) => Ok(format!("Hook install skipped (scp not available): {}", e)),
    }
}

#[tauri::command]
async fn prepare_gerrit_commit(
    data_path: String,
    skill_name: String,
    repo_url: String,
    branch: String,
    ssh_user: String,
    amend: bool,
) -> Result<String, String> {
    let _ = ssh_user; // reserved for future use
    let source_dir = Path::new(&data_path).join("my_skills").join(&skill_name);
    if !source_dir.exists() {
        return Err(format!("Local skill {} does not exist", skill_name));
    }

    let cache_dir = get_gerrit_cache_dir()?;

    // Clone if not yet cloned
    if !cache_dir.exists() {
        run_git_cmd(&["clone", &repo_url, cache_dir.to_str().unwrap()], None)?;
        // Install commit-msg hook
        let _ = install_gerrit_hook(cache_dir.to_str().unwrap().to_string()).await;
    }

    // In amend mode skip pull to preserve previous Change-Id
    if !amend {
        run_git_cmd(&["pull", "origin", &branch], Some(&cache_dir))?;

        // Detect and clean up any unpushed local commits that lack Change-Id.
        // These are leftovers from previous failed push attempts.
        // We soft-reset them so the files stay staged but the bad commits are gone.
        let origin_ref = format!("origin/{}", branch);
        let ahead = run_git_cmd(
            &["log", &format!("{}..HEAD", origin_ref), "--pretty=%H %s"],
            Some(&cache_dir),
        ).unwrap_or_default();

        if !ahead.trim().is_empty() {
            // Any unpushed commits in our local cache are leftovers from previous failed attempts.
            // Hard reset to origin to clear the index and working tree, drop unrelated changes.
            run_git_cmd(&["reset", "--hard", &origin_ref], Some(&cache_dir))?;
            // Clean any untracked files left over
            run_git_cmd(&["clean", "-fd"], Some(&cache_dir)).unwrap_or_default();
        }
    }

    // Copy skill files
    let target_dir = cache_dir.join(&skill_name);
    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)
            .map_err(|e| format!("Failed to remove old target dir: {}", e))?;
    }
    copy_dir_all(&source_dir, &target_dir)
        .map_err(|e| format!("Failed to copy skill files: {}", e))?;

    // Only add this specific skill's directory, avoiding untracked files elsewhere
    run_git_cmd(&["add", "--all", &skill_name], Some(&cache_dir))?;

    let status = run_git_cmd(&["status", "--porcelain", &skill_name], Some(&cache_dir))?;
    if status.trim().is_empty() && !amend {
        return Ok("".to_string());
    }

    let diff = run_git_cmd(&["diff", "--cached"], Some(&cache_dir))?;
    // In amend mode with no new diff, return last commit message as context
    if diff.trim().is_empty() && amend {
        let last_msg = run_git_cmd(&["log", "-1", "--pretty=%B"], Some(&cache_dir))
            .unwrap_or_default();
        return Ok(last_msg);
    }
    Ok(diff)
}

/// Generate a Gerrit-compatible Change-Id ("I" + 40 hex chars).
/// Uses current time + a simple hash to produce a unique, reproducible-looking ID.
fn generate_change_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple mixing to produce 40 hex digits
    let mut v: u64 = secs ^ ((nanos as u64) << 32) ^ 0xdeadbeef_cafebabe;
    let mut hex = String::with_capacity(40);
    for _ in 0..5 {
        v = v.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        hex.push_str(&format!("{:016x}", v));
    }
    hex.truncate(40);
    format!("I{}", hex)
}

#[tauri::command]
async fn commit_and_push_to_gerrit(
    repo_url: String,
    branch: String,
    commit_message: String,
    amend: bool,
) -> Result<String, String> {
    let _ = repo_url;
    let cache_dir = get_gerrit_cache_dir()?;
    if !cache_dir.exists() {
        return Err("Gerrit cache dir not found, did you call prepare first?".to_string());
    }

    if amend {
        // Preserve Change-Id from the previous commit
        let prev_msg = run_git_cmd(&["log", "-1", "--pretty=%B"], Some(&cache_dir))
            .unwrap_or_default();
        let change_id_line = prev_msg
            .lines()
            .find(|l| l.trim_start().starts_with("Change-Id:"))
            .map(|l| l.to_string());

        // Reuse existing Change-Id if available; otherwise generate new one
        let cid = change_id_line.unwrap_or_else(|| format!("Change-Id: {}", generate_change_id()));

        let final_msg = if commit_message.contains("Change-Id:") {
            commit_message.clone()
        } else {
            format!("{}\n{}", commit_message.trim_end(), cid)
        };
        run_git_cmd(&["commit", "--amend", "-m", &final_msg], Some(&cache_dir))?;
    } else {
        // New commit: always append a fresh Change-Id
        let final_msg = if commit_message.contains("Change-Id:") {
            commit_message.clone()
        } else {
            format!("{}\nChange-Id: {}", commit_message.trim_end(), generate_change_id())
        };
        run_git_cmd(&["commit", "-m", &final_msg], Some(&cache_dir))?;
    }

    // Push to Gerrit Code Review
    let refspec = format!("HEAD:refs/for/{}", branch);
    run_git_cmd(&["push", "origin", &refspec], Some(&cache_dir))?;

    Ok("Successfully pushed to Gerrit.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
        clone_github_repo, get_local_skills, get_skill_detail,
        create_local_skill, import_local_skill, delete_local_skill,
        batch_install_skill, prepare_skill_commit, commit_and_push_skill,
        install_gerrit_hook, prepare_gerrit_commit, commit_and_push_to_gerrit
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
