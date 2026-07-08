use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use chrono::Utc;
use rusqlite::Connection;
use tauri::Manager;
use crate::db::{init_db, DbState};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String, // Absolute path to the workspace folder
    pub last_opened: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceList {
    pub workspaces: Vec<Workspace>,
}

// Get the global config path: AppData/Local/com.photomanager.dev/workspaces.json
fn get_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("./"));
    
    // Ensure the app directory exists
    let _ = fs::create_dir_all(&path);
    path.push("workspaces.json");
    path
}

// Load workspaces from global config
pub fn load_workspaces(app_handle: &tauri::AppHandle) -> Vec<Workspace> {
    let config_file = get_config_path(app_handle);
    if !config_file.exists() {
        return Vec::new();
    }

    match fs::read_to_string(&config_file) {
        Ok(content) => {
            match serde_json::from_str::<WorkspaceList>(&content) {
                Ok(list) => list.workspaces,
                Err(_) => Vec::new(),
            }
        }
        Err(_) => Vec::new(),
    }
}

// Save workspaces to global config
pub fn save_workspaces(app_handle: &tauri::AppHandle, workspaces: Vec<Workspace>) {
    let config_file = get_config_path(app_handle);
    let list = WorkspaceList { workspaces };
    if let Ok(content) = serde_json::to_string_pretty(&list) {
        let _ = fs::write(config_file, content);
    }
}

// Open a workspace database connection
pub fn open_workspace_db(workspace_path: &str, state: &tauri::State<'_, DbState>) -> Result<(), String> {
    let path = Path::new(workspace_path);
    if !path.exists() {
        return Err("工作空间文件夹不存在".to_string());
    }

    // Create .photomanager metadata folder and thumbnails folder
    let meta_dir = path.join(".photomanager");
    let thumb_dir = meta_dir.join("thumbnails");
    
    if let Err(e) = fs::create_dir_all(&thumb_dir) {
        return Err(format!("无法创建元数据目录: {}", e));
    }

    let db_path = meta_dir.join("metadata.db");
    
    // Open new SQLite connection
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库: {}", e))?;

    // Initialize database tables
    init_db(&conn).map_err(|e| format!("数据库初始化失败: {}", e))?;

    // Automatically create a "默认相册" if there are 0 albums in the database
    let album_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
        .map_err(|e| format!("查询相册数量失败: {}", e))?;

    if album_count == 0 {
        let album_id = Uuid::new_v4().to_string();
        let album_name = "默认相册".to_string();
        let album_desc = Some("默认初始相册".to_string());
        let created_at = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Physically create the folder
        let album_folder = path.join(&album_name);
        if let Err(e) = fs::create_dir_all(&album_folder) {
            return Err(format!("无法创建默认相册文件夹: {}", e));
        }

        conn.execute(
            "INSERT INTO albums (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&album_id, &album_name, &album_desc, &created_at],
        )
        .map_err(|e| format!("写入默认相册记录失败: {}", e))?;
    }

    // Update active connection in state
    let mut conn_guard = state.conn.lock().unwrap();
    let mut path_guard = state.current_path.lock().unwrap();

    *conn_guard = Some(conn);
    *path_guard = Some(workspace_path.to_string());

    Ok(())
}
