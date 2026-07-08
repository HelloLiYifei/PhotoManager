use std::fs;
use std::path::Path;
use rusqlite::Connection;
use uuid::Uuid;
use walkdir::WalkDir;
use chrono::Utc;
use serde::Serialize;
use tauri::Emitter; // Tauri v2 Emitter trait for emitting events

use crate::db::{map_row_to_photo, Photo};
use crate::metadata::{generate_thumbnail, read_exif_metadata};

#[derive(Debug, Serialize, Clone)]
pub struct ScanProgress {
    pub scanned: i32,
    pub total: i32,
    pub current_file: String,
}

// Check if file extension is supported
pub fn is_supported_image(ext: &str) -> bool {
    let ext_lower = ext.to_lowercase();
    matches!(
        ext_lower.as_str(),
        "jpg" | "jpeg" | "png" | "arw" | "cr2" | "nef"
    )
}

// Recursively scan the workspace directory
pub fn scan_workspace_dir(
    workspace_path: &str,
    app_handle: &tauri::AppHandle,
    conn: &Connection,
) -> Result<i32, String> {
    let root_path = Path::new(workspace_path);
    if !root_path.exists() {
        return Err("工作空间不存在".to_string());
    }

    // 1. Collect all files to scan to show progress
    let mut files_to_scan = Vec::new();
    for entry in WalkDir::new(root_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        // Skip metadata folder .photomanager
        if entry.path().components().any(|c| c.as_os_str() == ".photomanager") {
            continue;
        }

        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if is_supported_image(ext) {
                    files_to_scan.push(entry.path().to_path_buf());
                }
            }
        }
    }

    let total_files = files_to_scan.len() as i32;
    let mut scanned_count = 0;
    let mut added_count = 0;

    let meta_dir = root_path.join(".photomanager");
    let thumb_dir = meta_dir.join("thumbnails");

    // 2. Iterate through files and process them
    for file_path in files_to_scan {
        scanned_count += 1;

        // Get path relative to the workspace root
        let relative_path = match file_path.strip_prefix(root_path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Emit progress every 5 files or on completion
        if scanned_count % 5 == 0 || scanned_count == total_files {
            let _ = app_handle.emit(
                "scan-progress",
                ScanProgress {
                    scanned: scanned_count,
                    total: total_files,
                    current_file: relative_path.clone(),
                },
            );
        }

        // Check if photo is already in the database
        let mut stmt = conn
            .prepare("SELECT id, path, filename, file_size, file_type, width, height, date_taken, date_added, camera_make, camera_model, lens_model, exposure_time, f_number, iso, focal_length, latitude, longitude, rating, is_favorite, is_deleted, deleted_at, hash FROM photos WHERE path = ?1")
            .map_err(|e| e.to_string())?;
        
        let exists = stmt.exists([&relative_path]).map_err(|e| e.to_string())?;
        if exists {
            continue; // Skip already scanned files
        }

        // Gather file metadata
        let metadata = match fs::metadata(&file_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let filename = file_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let file_size = metadata.len() as i64;
        let file_ext = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let is_raw = matches!(file_ext.to_lowercase().as_str(), "arw" | "cr2" | "nef");

        // Parse EXIF
        let exif_meta = read_exif_metadata(&file_path);

        // Date taken: fallback to file modified time if EXIF is empty
        let date_taken = exif_meta.date_taken.clone().unwrap_or_else(|| {
            let mod_time = metadata.modified().unwrap_or(std::time::SystemTime::now());
            let datetime: chrono::DateTime<Utc> = mod_time.into();
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        });

        let photo_id = Uuid::new_v4().to_string();
        let cache_file_name = format!("{}.jpg", photo_id);
        let cache_path = thumb_dir.join(&cache_file_name);

        // Generate thumbnail and get original dimensions
        let (width, height) = match generate_thumbnail(&file_path, &cache_path, is_raw) {
            Ok(dims) => dims,
            Err(_) => {
                // If thumbnail fails, try to use defaults or skip
                (exif_meta.width.unwrap_or(0), exif_meta.height.unwrap_or(0))
            }
        };

        // Create simple hash based on size and modified time for fast duplicate check
        let mod_time = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let file_hash = format!("{}_{}", file_size, mod_time);

        let date_added = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Insert photo into database
        let result = conn.execute(
            "INSERT INTO photos (
                id, path, filename, file_size, file_type, width, height, 
                date_taken, date_added, camera_make, camera_model, lens_model, 
                exposure_time, f_number, iso, focal_length, latitude, longitude, hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            rusqlite::params![
                &photo_id,
                &relative_path,
                &filename,
                file_size,
                &file_ext.to_uppercase(),
                width,
                height,
                &date_taken,
                &date_added,
                exif_meta.camera_make,
                exif_meta.camera_model,
                exif_meta.lens_model,
                exif_meta.exposure_time,
                exif_meta.f_number,
                exif_meta.iso,
                exif_meta.focal_length,
                exif_meta.latitude,
                exif_meta.longitude,
                &file_hash,
            ],
        );

        if result.is_ok() {
            added_count += 1;
        }
    }

    Ok(added_count)
}
