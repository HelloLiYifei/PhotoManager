use rusqlite::params;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, State};
use uuid::Uuid;
use chrono::Utc;

use crate::db::{map_row_to_photo, Album, AlbumSummary, DbState, Photo};
use crate::workspace::{load_workspaces, save_workspaces, open_workspace_db, Workspace};
use crate::scan::scan_workspace_dir;
use crate::import::{detect_removable_cards, scan_card_files, execute_import, CardInfo, CardPhoto, ImportLocation, PhotoImportInfo};

fn remove_thumbnail_cache(workspace_root: &Path, photo_id: &str) {
    let thumbnail_paths = [
        crate::metadata::thumbnail_cache_path(workspace_root, photo_id),
        workspace_root
            .join(".photomanager")
            .join("thumbnails")
            .join(format!("{}.jpg", photo_id)),
    ];

    for thumbnail_path in thumbnail_paths {
        if thumbnail_path.exists() {
            let _ = fs::remove_file(thumbnail_path);
        }
    }
}

fn import_preview_cache_key(path: &str, metadata: &fs::Metadata) -> String {
    // FNV-1a is enough here: this only creates a stable, filesystem-safe
    // cache filename from the source identity and invalidates when it changes.
    let mut hash = 0xcbf29ce484222325_u64;
    let mut mix = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    };

    mix(path.as_bytes());
    mix(&metadata.len().to_le_bytes());
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok());
    let modified_seconds = modified.map(|duration| duration.as_secs()).unwrap_or(0);
    let modified_nanos = modified
        .map(|duration| duration.subsec_nanos())
        .unwrap_or(0);
    mix(&modified_seconds.to_le_bytes());
    mix(&modified_nanos.to_le_bytes());

    format!("{hash:016x}")
}

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
    tag_filter: Option<String>,
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

    if let Some(ref tag) = tag_filter {
        if !tag.trim().is_empty() {
            query.push_str(&format!(" AND id IN (SELECT photo_id FROM photo_tags pt INNER JOIN tags t ON pt.tag_id = t.id WHERE t.name = '{}')", tag));
        }
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
    remove_thumbnail_cache(Path::new(workspace_root), &id);

    // 3. Delete from DB
    conn.execute("DELETE FROM photos WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;

    Ok(())
}

// --- PHOTO LOADING COMMANDS ---

#[tauri::command]
pub async fn get_photo_thumbnail_url(state: State<'_, DbState>, id: String) -> Result<String, String> {
    let (workspace_root, relative_path, file_type) = {
        let current_path_guard = state.current_path.lock().unwrap();
        let workspace_root = current_path_guard.as_ref().ok_or("没有打开的工作空间")?.clone();

        let conn_guard = state.conn.lock().unwrap();
        let conn = conn_guard.as_ref().ok_or("数据库未连接")?;
        let mut stmt = conn
            .prepare("SELECT path, file_type FROM photos WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let (relative_path, file_type): (String, String) = stmt
            .query_row([&id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        (workspace_root, relative_path, file_type)
    };

    let _permit = get_thumb_semaphore()
        .acquire()
        .await
        .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        let workspace_path = Path::new(&workspace_root);
        let thumbnail_path = crate::metadata::thumbnail_cache_path(workspace_path, &id);

        if !thumbnail_path.exists() {
            let photo_path = workspace_path.join(&relative_path);
            let is_raw = matches!(file_type.to_lowercase().as_str(), "arw" | "cr2" | "nef");
            let _ = fs::create_dir_all(
                thumbnail_path
                    .parent()
                    .ok_or("无法确定缩略图缓存目录")?,
            );

            if let Err(error) = crate::metadata::generate_thumbnail(&photo_path, &thumbnail_path, is_raw) {
                // Preserve access to a pre-upgrade cache if a damaged or
                // unsupported original cannot be regenerated.
                let legacy_path = workspace_path
                    .join(".photomanager")
                    .join("thumbnails")
                    .join(format!("{}.jpg", id));
                if legacy_path.exists() {
                    return Ok(crate::media::photo_thumbnail_url(&id));
                }
                return Err(error);
            }
        }

        Ok(crate::media::photo_thumbnail_url(&id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_photo_preview_url(
    state: State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    {
        let current_path_guard = state.current_path.lock().unwrap();
        current_path_guard.as_ref().ok_or("没有打开的工作空间")?;

        let conn_guard = state.conn.lock().unwrap();
        let conn = conn_guard.as_ref().ok_or("数据库未连接")?;
        conn.query_row("SELECT 1 FROM photos WHERE id = ?1", [&id], |_| Ok(()))
            .map_err(|e| e.to_string())?;
    }

    // The media protocol streams encoded image bytes straight to WebView2.
    // This avoids a full Rust decode + resize + JPEG encode and the additional
    // base64 copy over Tauri IPC on every open.
    Ok(crate::media::photo_preview_url(&id))
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
pub fn get_album_summaries(state: State<'_, DbState>) -> Result<Vec<AlbumSummary>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = match &*conn_guard {
        Some(conn) => conn,
        None => return Ok(Vec::new()),
    };

    crate::db::query_album_summaries(conn).map_err(|error| error.to_string())
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
pub fn scan_card(state: State<'_, DbState>, path: String) -> Result<Vec<CardPhoto>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref();
    Ok(scan_card_files(&path, conn))
}

#[tauri::command]
pub async fn import_photos(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    imports: Vec<PhotoImportInfo>,
    name_template: String,
    backup_path: Option<String>,
    current_location: Option<ImportLocation>,
) -> Result<i32, String> {
    execute_import(
        &app_handle,
        &state,
        imports,
        &name_template,
        backup_path,
        current_location,
    )
}

#[tauri::command]
pub fn select_directory() -> Option<String> {
    let dir = rfd::FileDialog::new().pick_folder();
    dir.map(|p| p.to_string_lossy().to_string())
}

use std::sync::OnceLock;
use tokio::sync::Semaphore;

static THUMB_SEMAPHORE: OnceLock<Semaphore> = OnceLock::new();

fn get_thumb_semaphore() -> &'static Semaphore {
    THUMB_SEMAPHORE.get_or_init(|| {
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        // Match the reference app's bounded thumbnail worker pool. More
        // parallel decodes make removable-media reads slower, not faster.
        Semaphore::new((cores / 2).clamp(2, 4))
    })
}

#[tauri::command]
pub async fn get_image_thumbnail_url(
    state: State<'_, DbState>,
    path: String,
    is_raw: bool,
) -> Result<String, String> {
    let workspace_root = {
        let current_path_guard = state.current_path.lock().unwrap();
        current_path_guard
            .as_ref()
            .ok_or("没有打开的工作空间")?
            .clone()
    };

    let sem = get_thumb_semaphore();
    let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.exists() {
            return Err("文件不存在".to_string());
        }

        let source_metadata = fs::metadata(p).map_err(|e| e.to_string())?;
        let cache_key = import_preview_cache_key(&path, &source_metadata);
        let workspace_path = Path::new(&workspace_root);
        let cache_path = crate::metadata::import_preview_cache_path(workspace_path, &cache_key);

        if cache_path.exists() {
            if image::image_dimensions(&cache_path).is_ok() {
                return Ok(crate::media::import_preview_url(&cache_key));
            }
            let _ = fs::remove_file(&cache_path);
        }

        fs::create_dir_all(
            cache_path
                .parent()
                .ok_or("无法确定导入预览缓存目录")?,
        )
        .map_err(|e| e.to_string())?;

        // On Windows, ask the exact Shell thumbnail cache used by Explorer
        // before reading the removable-media source.  A cache hit avoids both
        // image decoding and the SD-card I/O that previously dominated first
        // paint. The Shell result is already orientation-correct.
        if let Some(shell_image) = crate::shell_thumbnail::load(p, 384) {
            let thumb = shell_image.thumbnail(
                crate::metadata::THUMBNAIL_MAX_DIMENSION,
                crate::metadata::THUMBNAIL_MAX_DIMENSION,
            );
            let bytes = crate::metadata::encode_thumbnail_jpeg(&thumb)?;
            fs::write(&cache_path, bytes).map_err(|e| e.to_string())?;
            return Ok(crate::media::import_preview_url(&cache_key));
        }

        // The first request reads the card once and leaves a local cache in
        // the workspace; returning to a folder or scrolling back never reads
        // the removable drive again.
        let (mut img, is_exif_thumb) = {
            let (bytes, is_exif) = if is_raw {
                match crate::metadata::extract_raw_small_preview(p) {
                    Ok(b) => (b, true),
                    Err(_) => {
                        let b = crate::metadata::extract_raw_preview(p)
                            .map_err(|e| format!("RAW大预览图提取失败: {}", e))?;
                        (b, false)
                    }
                }
            } else {
                match crate::metadata::extract_jpeg_exif_thumbnail(p) {
                    Some(b) => (b, true),
                    None => {
                        let b = std::fs::read(p).map_err(|e| e.to_string())?;
                        (b, false)
                    }
                }
            };

            let decoded = image::load_from_memory(&bytes)
                .map_err(|e| format!("图片解码失败: {}", e))?;

            // Very small embedded previews are quick but visibly soft on a
            // high-density card, so fall back to the original when needed.
            if is_exif && (decoded.width() < 384 || decoded.height() < 384) {
                let full_bytes = std::fs::read(p).map_err(|e| e.to_string())?;
                let full_decoded = image::load_from_memory(&full_bytes)
                    .map_err(|e| format!("原图解码失败: {}", e))?;
                (full_decoded, false)
            } else {
                (decoded, is_exif)
            }
        };
            
        // Rotate based on EXIF orientation
        let orientation = crate::metadata::get_orientation(p);
        if orientation != 1 {
            img = crate::metadata::rotate_image(img, orientation);
        }

        // Skip a second resize when an embedded preview already fits the
        // display target; otherwise create a sharper 512px thumbnail.
        let thumb = if is_exif_thumb && img.width() <= crate::metadata::THUMBNAIL_MAX_DIMENSION && img.height() <= crate::metadata::THUMBNAIL_MAX_DIMENSION {
            img
        } else {
            img.thumbnail(
                crate::metadata::THUMBNAIL_MAX_DIMENSION,
                crate::metadata::THUMBNAIL_MAX_DIMENSION,
            )
        };
        
        let bytes = crate::metadata::encode_thumbnail_jpeg(&thumb)?;
        fs::write(cache_path, bytes).map_err(|e| e.to_string())?;

        Ok(crate::media::import_preview_url(&cache_key))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn move_photos_to_album(state: State<'_, DbState>, photo_ids: Vec<String>, target_album_id: String) -> Result<(), String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root_str = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    let workspace_root = Path::new(&workspace_root_str);

    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    // Get target album name
    let mut stmt = conn.prepare("SELECT name FROM albums WHERE id = ?1").map_err(|e| e.to_string())?;
    let target_album_name: String = stmt.query_row([&target_album_id], |row| row.get(0)).map_err(|e| e.to_string())?;

    let dest_folder = workspace_root.join(&target_album_name);
    fs::create_dir_all(&dest_folder).map_err(|e| e.to_string())?;

    for id in photo_ids {
        // Query current photo path
        let mut stmt = conn.prepare("SELECT path, filename FROM photos WHERE id = ?1").map_err(|e| e.to_string())?;
        let (rel_path, filename): (String, String) = stmt.query_row([&id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;

        let src_path = workspace_root.join(&rel_path);
        
        let file_ext = Path::new(&filename).extension().and_then(|s| s.to_str()).unwrap_or("jpg").to_string();
        let file_stem = Path::new(&filename).file_stem().and_then(|s| s.to_str()).unwrap_or("photo").to_string();

        let mut dest_file = dest_folder.join(&filename);
        let mut final_filename = filename.clone();
        let mut idx = 1;
        while dest_file.exists() {
            final_filename = format!("{}_{}.{}", file_stem, idx, file_ext);
            dest_file = dest_folder.join(&final_filename);
            idx += 1;
        }

        // Physically move the file
        if src_path.exists() {
            fs::rename(&src_path, &dest_file).map_err(|e| format!("物理移动文件失败: {}", e))?;
        }

        // Update database photo path
        let new_rel_path = format!("{}/{}", target_album_name, final_filename);
        conn.execute("UPDATE photos SET path = ?1, filename = ?2 WHERE id = ?3", params![&new_rel_path, &final_filename, &id])
            .map_err(|e| e.to_string())?;

        // Update album_photos mapping
        conn.execute("DELETE FROM album_photos WHERE photo_id = ?1", [&id]).map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO album_photos (album_id, photo_id) VALUES (?1, ?2)", params![&target_album_id, &id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn add_tag_to_photo(state: State<'_, DbState>, photo_id: String, tag_name: String) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let tag_name = tag_name.trim().to_string();
    if tag_name.is_empty() {
        return Err("标签名称不能为空".to_string());
    }

    // Get or create tag
    let tag_id = match conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        [&tag_name],
        |row| row.get::<_, String>(0)
    ) {
        Ok(id) => id,
        Err(_) => {
            let id = Uuid::new_v4().to_string();
            conn.execute("INSERT INTO tags (id, name) VALUES (?1, ?2)", params![&id, &tag_name]).map_err(|e| e.to_string())?;
            id
        }
    };

    // Insert relationship
    conn.execute("INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?1, ?2)", params![&photo_id, &tag_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_photo(state: State<'_, DbState>, photo_id: String, tag_name: String) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let tag_name = tag_name.trim().to_string();
    
    // Find tag
    let tag_id: Option<String> = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        [&tag_name],
        |row| row.get(0)
    ).ok();

    if let Some(id) = tag_id {
        conn.execute("DELETE FROM photo_tags WHERE photo_id = ?1 AND tag_id = ?2", params![&photo_id, &id])
            .map_err(|e| e.to_string())?;
            
        // Check if tag is used elsewhere. If not, we can clean up the tag record
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM photo_tags WHERE tag_id = ?1",
            [&id],
            |row| row.get(0)
        ).unwrap_or(0);
        
        if count == 0 {
            let _ = conn.execute("DELETE FROM tags WHERE id = ?1", [&id]);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_photo_tags(state: State<'_, DbState>, photo_id: String) -> Result<Vec<String>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t 
         INNER JOIN photo_tags pt ON t.id = pt.tag_id 
         WHERE pt.photo_id = ?1"
    ).map_err(|e| e.to_string())?;

    let tags = stmt.query_map([&photo_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn get_all_tags(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let mut stmt = conn.prepare("SELECT name FROM tags").map_err(|e| e.to_string())?;
    let tags = stmt.query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn permanently_delete_photos(state: State<'_, DbState>, ids: Vec<String>) -> Result<(), String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root_str = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    let workspace_root = Path::new(&workspace_root_str);

    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    for id in ids {
        // Query path
        let mut stmt = conn.prepare("SELECT path FROM photos WHERE id = ?1").map_err(|e| e.to_string())?;
        if let Ok(rel_path) = stmt.query_row([&id], |row| row.get::<_, String>(0)) {
            let abs_path = workspace_root.join(&rel_path);
            if abs_path.exists() {
                let _ = trash::delete(&abs_path);
            }
        }
        remove_thumbnail_cache(workspace_root, &id);
        // Delete records
        let _ = conn.execute("DELETE FROM photos WHERE id = ?1", [&id]);
    }

    Ok(())
}

#[tauri::command]
pub fn restore_photos(state: State<'_, DbState>, ids: Vec<String>) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    for id in ids {
        let _ = conn.execute("UPDATE photos SET is_deleted = 0, deleted_at = NULL WHERE id = ?1", [&id]);
    }

    Ok(())
}

#[tauri::command]
pub fn empty_trash_to_recycle_bin(state: State<'_, DbState>) -> Result<(), String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root_str = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    let workspace_root = Path::new(&workspace_root_str);

    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let mut stmt = conn.prepare("SELECT id, path FROM photos WHERE is_deleted = 1").map_err(|e| e.to_string())?;
    let photos_iter = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for photo in photos_iter.flatten() {
        let id = photo.0;
        let rel_path = photo.1;
        let abs_path = workspace_root.join(&rel_path);

        if abs_path.exists() {
            let _ = trash::delete(&abs_path);
        }
        remove_thumbnail_cache(workspace_root, &id);
        let _ = conn.execute("DELETE FROM photos WHERE id = ?1", [&id]);
    }

    Ok(())
}

#[tauri::command]
pub fn export_photos(state: State<'_, DbState>, photo_ids: Vec<String>, dest_dir: String) -> Result<(), String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root_str = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    let workspace_root = Path::new(&workspace_root_str);

    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("数据库未连接")?;

    let dest_path = Path::new(&dest_dir);
    if !dest_path.exists() {
        return Err("目标文件夹不存在".to_string());
    }

    for id in photo_ids {
        let mut stmt = conn.prepare("SELECT path, filename FROM photos WHERE id = ?1").map_err(|e| e.to_string())?;
        if let Ok((rel_path, filename)) = stmt.query_row([&id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) {
            let src_path = workspace_root.join(&rel_path);
            let target_path = dest_path.join(&filename);
            
            if src_path.exists() {
                let mut final_target = target_path.clone();
                let file_ext = target_path.extension().and_then(|s| s.to_str()).unwrap_or("jpg");
                let file_stem = target_path.file_stem().and_then(|s| s.to_str()).unwrap_or("exported");
                let mut idx = 1;
                while final_target.exists() {
                    final_target = dest_path.join(format!("{}_{}.{}", file_stem, idx, file_ext));
                    idx += 1;
                }
                let _ = fs::copy(&src_path, &final_target);
            }
        }
    }

    Ok(())
}
