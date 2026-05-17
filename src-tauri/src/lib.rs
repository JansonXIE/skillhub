use std::process::Command;
use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: Option<String>,
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


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![clone_github_repo, get_local_skills, get_skill_detail, create_local_skill, import_local_skill, delete_local_skill])
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
