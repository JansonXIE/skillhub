use std::process::Command;
use std::fs;
use std::path::Path;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![clone_github_repo])
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
