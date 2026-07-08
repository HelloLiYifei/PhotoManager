use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use uuid::Uuid;
use chrono::Utc;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_ENGINE};

use crate::db::{map_row_to_photo, Album, DbState, Photo};
use crate::workspace::{load_workspaces, save_workspaces, open_workspace_db, Workspace};
use crate::scan::scan_workspace_dir;
use crate::import::{detect_removable_cards, scan_card_files, execute_import, CardInfo, CardPhoto};

// --- WORKSPACE COMMANDS ---

#[tauri::command]
pub fn get_workspaces(app_handle: AppHandle) -> Result<Vec<Workspace>, String> {
    Ok(load_workspaces(&app_handle))
}

#[tauri::command]
pub fn create_workspace(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    name: String,
    path: String,
) -> Result<Workspace, String> {
    let mut workspaces = load_workspaces(&app_handle);
    
    // Check if path is already registered
    if workspaces.iter().any(|w| w.path == path) {
        return Err("该路径已被注册为工作空间".to_string());
    }

    let ws = Workspace {
        id: Uuid::new_v4().to_string(),
        name,
        path: path.clone(),
        last_opened: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    // Open/Create database at workspace path
    open_workspace_db(&path, &state)?;

    workspaces.push(ws.clone());
    save_workspaces(&app_handle, workspaces);

    Ok(ws)
}

#[tauri::command]
pub fn open_workspace(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<Workspace, String> {
    let mut workspaces = load_workspaces(&app_handle);
    
    // Find workspace or create a temp registration
    let index = workspaces.iter().position(|w| w.path == path);
    
    let ws = match index {
        Some(idx) => {
            workspaces[idx].last_opened = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            workspaces[idx].clone()
        }
        None => {
            // If not registered but folder exists, register it
            let folder_name = Path::new(&path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("未命名仓库")
                .to_string();
            
            let new_ws = Workspace {
                id: Uuid::new_v4().to_string(),
                name: folder_name,
                path: path.clone(),
                last_opened: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            };
            workspaces.push(new_ws.clone());
            new_ws
        }
    };

    // Open connection
    open_workspace_db(&path, &state)?;

    // Save updated workspaces list
    save_workspaces(&app_handle, workspaces);

    Ok(ws)
}

#[tauri::command]
pub fn delete_workspace(app_handle: AppHandle, id: String) -> Result<(), String> {
    let mut workspaces = load_workspaces(&app_handle);
    if let Some(idx) = workspaces.iter().position(|w| w.id == id) {
        workspaces.remove(idx);
        save_workspaces(&app_handle, workspaces);
        Ok(())
    } else {
        Err("工作空间不存在".to_string())
    }
}

#[tauri::command]
pub fn get_active_workspace(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let path_guard = state.current_path.lock().unwrap();
    Ok(path_guard.clone())
}

// --- PHOTO DATABASE COMMANDS ---

#[tauri::command]
pub fn get_photos(
    state: State<'_, DbState>,
    search: Option<String>,
    favorite_only: bool,
    deleted_only: bool,
    album_id: Option<String>,
    rating_filter: Option<i32>,
) -> Result<Vec<Photo>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = match &*conn_guard {
        Some(c) => c,
        None => return Ok(Vec::new()), // No active workspace
    };

    let mut query = "SELECT id, path, filename, file_size, file_type, width, height, date_taken, date_added, camera_make, camera_model, lens_model, exposure_time, f_number, iso, focal_length, latitude, longitude, rating, is_favorite, is_deleted, deleted_at, hash FROM photos WHERE 1=1".to_string();
    
    // Filters
    if favorite_only {
        query.push_str(" AND is_favorite = 1");
    }
    
    if deleted_only {
        query.push_str(" AND is_deleted = 1");
    } else {
        query.push_str(" AND is_deleted = 0");
    }

    if let Some(rating) = rating_filter {
        query.push_str(&format!(" AND rating >= {}", rating));
    }

    if let Some(ref text) = search {
        if !text.trim().is_empty() {
            query.push_str(&format!(" AND (filename LIKE '%{}%' OR camera_model LIKE '%{}%' OR camera_make LIKE '%{}%')", text, text, text));
        }
    }

    if let Some(ref alb_id) = album_id {
        query.push_str(&format!(" AND id IN (SELECT photo_id FROM album_photos WHERE album_id = '{}')", alb_id));
    }

    // Sort by date_taken descending (mobile timeline style)
    query.push_str(" ORDER BY date_taken DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let photo_iter = stmt
        .query_map([], |row| map_row_to_photo(row))
        .map_err(|e| e.to_string())?;

    let mut photos = Vec::new();
    for photo in photo_iter {
        if let Ok(p) = photo {
            photos.push(p);
        }
    }

    Ok(photos)
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, DbState>, id: String, is_favorite: bool) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;
    
    let val = if is_favorite { 1 } else { 0 };
    conn.execute("UPDATE photos SET is_favorite = ?1 WHERE id = ?2", params![val, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_rating(state: State<'_, DbState>, id: String, rating: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;
    
    conn.execute("UPDATE photos SET rating = ?1 WHERE id = ?2", params![rating, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_photo(state: State<'_, DbState>, id: String, is_deleted: bool) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;
    
    let val = if is_deleted { 1 } else { 0 };
    let deleted_at = if is_deleted {
        Some(Utc::now().format("%Y-%m-%d %H:%M:%S").to_string())
    } else {
        None
    };

    conn.execute("UPDATE photos SET is_deleted = ?1, deleted_at = ?2 WHERE id = ?3", params![val, deleted_at, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn permanently_delete_photo(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root = current_path_guard.as_ref().ok_or("没有打开的工作空间")?;
    
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    // Get relative path of photo to delete it physically
    let mut stmt = conn.prepare("SELECT path FROM photos WHERE id = ?1").map_err(|e| e.to_string())?;
    let relative_path: String = stmt.query_row([&id], |row| row.get(0)).map_err(|e| e.to_string())?;

    // 1. Delete physical photo file
    let photo_physical_path = Path::new(workspace_root).join(&relative_path);
    if photo_physical_path.exists() {
        let _ = fs::remove_file(photo_physical_path);
    }

    // 2. Delete cache thumbnail
    let thumbnail_path = Path::new(workspace_root)
        .join(".photomanager")
        .join("thumbnails")
        .join(format!("{}.jpg", id));
    if thumbnail_path.exists() {
        let _ = fs::remove_file(thumbnail_path);
    }

    // 3. Delete from DB
    conn.execute("DELETE FROM photos WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;

    Ok(())
}

// --- PHOTO LOADING COMMANDS (BASE64) ---

#[tauri::command]
pub fn get_photo_thumbnail_base64(state: State<'_, DbState>, id: String) -> Result<String, String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root = current_path_guard.as_ref().ok_or("没有打开的工作空间")?;

    let thumbnail_path = Path::new(workspace_root)
        .join(".photomanager")
        .join("thumbnails")
        .join(format!("{}.jpg", id));

    if !thumbnail_path.exists() {
        return Err("缩略图不存在".to_string());
    }

    let bytes = fs::read(thumbnail_path).map_err(|e| e.to_string())?;
    let b64 = BASE64_ENGINE.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub fn get_photo_preview_base64(state: State<'_, DbState>, id: String) -> Result<String, String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root = current_path_guard.as_ref().ok_or("没有打开的工作空间")?;

    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let mut stmt = conn
        .prepare("SELECT path, file_type FROM photos WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let (relative_path, file_type): (String, String) = stmt
        .query_row([&id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;

    let photo_physical_path = Path::new(workspace_root).join(&relative_path);
    if !photo_physical_path.exists() {
        return Err("照片原文件不存在".to_string());
    }

    let is_raw = matches!(file_type.to_lowercase().as_str(), "arw" | "cr2" | "nef");

    let bytes = if is_raw {
        // Extract embedded JPEG preview
        crate::metadata::extract_raw_preview(&photo_physical_path)
            .map_err(|e| format!("RAW预览图提取失败: {}", e))?
    } else {
        // Read JPG directly
        fs::read(photo_physical_path).map_err(|e| e.to_string())?
    };

    let b64 = BASE64_ENGINE.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

// --- ALBUM COMMANDS ---

#[tauri::command]
pub fn get_albums(state: State<'_, DbState>) -> Result<Vec<Album>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = match &*conn_guard {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };

    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.description, a.created_at, a.cover_photo_id,
            (SELECT COUNT(*) FROM album_photos ap JOIN photos p ON ap.photo_id = p.id WHERE ap.album_id = a.id AND p.is_deleted = 0) as photo_count
            FROM albums a
            ORDER BY a.name ASC"
        )
        .map_err(|e| e.to_string())?;

    let album_iter = stmt
        .query_map([], |row| {
            Ok(Album {
                id: row.get("id")?,
                name: row.get("name")?,
                description: row.get("description")?,
                created_at: row.get("created_at")?,
                cover_photo_id: row.get("cover_photo_id")?,
                photo_count: Some(row.get("photo_count")?),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut albums = Vec::new();
    for album in album_iter {
        if let Ok(a) = album {
            albums.push(a);
        }
    }

    Ok(albums)
}

#[tauri::command]
pub fn create_album(state: State<'_, DbState>, name: String, description: Option<String>) -> Result<Album, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let album = Album {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        created_at: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        cover_photo_id: None,
        photo_count: Some(0),
    };

    conn.execute(
        "INSERT INTO albums (id, name, description, created_at, cover_photo_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![album.id, album.name, album.description, album.created_at, album.cover_photo_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(album)
}

#[tauri::command]
pub fn delete_album(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    conn.execute("DELETE FROM albums WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_photos_to_album(state: State<'_, DbState>, album_id: String, photo_ids: Vec<String>) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    for photo_id in &photo_ids {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
            params![album_id, photo_id],
        );
    }

    // Set first photo as cover if not set
    let mut stmt = conn.prepare("SELECT cover_photo_id FROM albums WHERE id = ?1").map_err(|e| e.to_string())?;
    let current_cover: Option<String> = stmt.query_row([&album_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    
    if current_cover.is_none() && !photo_ids.is_empty() {
        conn.execute("UPDATE albums SET cover_photo_id = ?1 WHERE id = ?2", params![&photo_ids[0], album_id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn remove_photos_from_album(state: State<'_, DbState>, album_id: String, photo_ids: Vec<String>) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    for photo_id in &photo_ids {
        conn.execute("DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2", params![album_id, photo_id])
            .map_err(|e| e.to_string())?;
    }

    // Reset cover if it was deleted
    let mut stmt = conn.prepare("SELECT cover_photo_id FROM albums WHERE id = ?1").map_err(|e| e.to_string())?;
    let current_cover: Option<String> = stmt.query_row([&album_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    
    if let Some(cover_id) = current_cover {
        if photo_ids.contains(&cover_id) {
            // Select new cover (first remaining photo in album)
            let mut stmt2 = conn.prepare("SELECT photo_id FROM album_photos WHERE album_id = ?1 LIMIT 1").map_err(|e| e.to_string())?;
            let next_photo: Option<String> = stmt2.query_row([&album_id], |row| row.get(0)).ok();
            conn.execute("UPDATE albums SET cover_photo_id = ?1 WHERE id = ?2", params![next_photo, album_id])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// --- SCAN AND IMPORT COMMANDS ---

#[tauri::command]
pub async fn scan_workspace(app_handle: AppHandle, state: State<'_, DbState>) -> Result<i32, String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    
    let conn_guard = state.conn.lock().unwrap();
    let conn = match &*conn_guard {
        Some(c) => c,
        None => return Err("数据库未连接".to_string()),
    };

    // Scan the folder
    scan_workspace_dir(&workspace_root, &app_handle, conn)
}

#[tauri::command]
pub fn detect_cards() -> Result<Vec<CardInfo>, String> {
    Ok(detect_removable_cards())
}

#[tauri::command]
pub fn scan_card(path: String) -> Result<Vec<CardPhoto>, String> {
    Ok(scan_card_files(&path))
}

#[tauri::command]
pub async fn import_photos(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    photo_paths: Vec<String>,
    folder_template: String,
    name_template: String,
    event_name: String,
    backup_path: Option<String>,
) -> Result<i32, String> {
    execute_import(&app_handle, &state, photo_paths, &folder_template, &name_template, &event_name, backup_path)
}
