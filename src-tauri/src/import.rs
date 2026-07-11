use std::fs;
use std::path::Path;
use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use uuid::Uuid;
use chrono::Utc;
use tauri::Emitter;

use crate::db::DbState;
use rusqlite::Connection;
use crate::metadata::{generate_thumbnail, read_exif_metadata, thumbnail_cache_path};
use crate::scan::is_supported_image;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportProgress {
    pub copied: i32,
    pub total: i32,
    pub current_file: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CardInfo {
    pub drive_letter: String,
    pub path: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CardPhoto {
    pub relative_path: String,
    pub absolute_path: String,
    pub size: i64,
    pub date_taken: String,
    pub is_raw: bool,
    pub already_imported: bool,
}

// Windows FFI to check drive types
#[cfg(target_os = "windows")]
extern "system" {
    fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
    fn GetVolumeInformationW(
        lpRootPathName: *const u16,
        lpVolumeNameBuffer: *mut u16,
        nVolumeNameSize: u32,
        lpVolumeSerialNumber: *mut u32,
        lpMaximumComponentLength: *mut u32,
        lpFileSystemFlags: *mut u32,
        lpFileSystemNameBuffer: *mut u16,
        nFileSystemNameSize: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
fn get_windows_drive_label(drive: &str) -> String {
    let mut wide_drive: Vec<u16> = drive.encode_utf16().collect();
    wide_drive.push(0);

    let mut volume_name = vec![0u16; 256];
    unsafe {
        let success = GetVolumeInformationW(
            wide_drive.as_ptr(),
            volume_name.as_mut_ptr(),
            volume_name.len() as u32,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        );

        if success != 0 {
            // Find null terminator
            let len = volume_name.iter().position(|&x| x == 0).unwrap_or(0);
            if len > 0 {
                return String::from_utf16_lossy(&volume_name[..len]);
            }
        }
    }
    "存储卡".to_string()
}

// Detect camera memory cards / removable drives containing a DCIM folder
pub fn detect_removable_cards() -> Vec<CardInfo> {
    let mut cards = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Loop drive letters from D:\ to Z:\
        for drive_char in b'D'..=b'Z' {
            let drive_letter = format!("{}:\\", drive_char as char);
            let mut wide_path: Vec<u16> = drive_letter.encode_utf16().collect();
            wide_path.push(0);

            let drive_type = unsafe { GetDriveTypeW(wide_path.as_ptr()) };
            
            // DRIVE_REMOVABLE = 2
            if drive_type == 2 {
                let drive_path = Path::new(&drive_letter);
                if drive_path.exists() {
                    // Check if DCIM folder exists
                    let dcim_path = drive_path.join("DCIM");
                    if dcim_path.exists() {
                        let label = get_windows_drive_label(&drive_letter);
                        cards.push(CardInfo {
                            drive_letter: format!("{}:", drive_char as char),
                            path: drive_letter.clone(),
                            label,
                        });
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for macOS/Linux (checking /Volumes or /media)
        let paths = &["/Volumes", "/media"];
        for mount_root in paths {
            if let Ok(entries) = fs::read_dir(mount_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let dcim_path = path.join("DCIM");
                    if dcim_path.exists() {
                        let label = path.file_name().and_then(|s| s.to_str()).unwrap_or("存储卡").to_string();
                        cards.push(CardInfo {
                            drive_letter: path.to_string_lossy().to_string(),
                            path: path.to_string_lossy().to_string(),
                            label,
                        });
                    }
                }
            }
        }
    }

    cards
}

// Scan files on the detected card
pub fn scan_card_files(card_path: &str, conn: Option<&Connection>) -> Vec<CardPhoto> {
    let root = Path::new(card_path);
    let dcim_path = root.join("DCIM");
    let scan_root = if dcim_path.exists() { &dcim_path } else { root };

    // A single indexed read replaces one SQL statement per source file. This
    // matters on storage cards where directory traversal is already I/O bound.
    let existing_files: HashSet<(String, i64)> = conn
        .and_then(|connection| {
            let mut stmt = connection
                .prepare("SELECT filename, file_size FROM photos")
                .ok()?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .ok()?;
            let entries = rows.flatten().collect();
            Some(entries)
        })
        .unwrap_or_default();

    let mut photos = Vec::new();
    for entry in WalkDir::new(scan_root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if is_supported_image(ext) {
                    let absolute_path = entry.path().to_string_lossy().to_string();
                    let relative_path = entry.path()
                        .strip_prefix(root)
                        .unwrap_or(entry.path())
                        .to_string_lossy()
                        .to_string();

                    let metadata = match fs::metadata(entry.path()) {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    
                    let size = metadata.len() as i64;
                    let file_ext = ext.to_lowercase();
                    let is_raw = matches!(file_ext.as_str(), "arw" | "cr2" | "nef");

                    // Do not parse EXIF during card discovery. It forces a
                    // second read of every file on slow removable media; the
                    // full EXIF is still extracted once, during import.
                    let mod_time = metadata.modified().unwrap_or(std::time::SystemTime::now());
                    let datetime: chrono::DateTime<Utc> = mod_time.into();
                    let date_taken = datetime.format("%Y-%m-%d %H:%M:%S").to_string();

                    let filename = entry.path()
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let already_imported = existing_files.contains(&(filename.clone(), size));

                    photos.push(CardPhoto {
                        relative_path,
                        absolute_path,
                        size,
                        date_taken,
                        is_raw,
                        already_imported,
                    });
                }
            }
        }
    }

    // Sort by date taken descending
    photos.sort_by(|a, b| b.date_taken.cmp(&a.date_taken));
    photos
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoImportInfo {
    pub absolute_path: String,
    pub album_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
pub struct ImportLocation {
    pub latitude: f64,
    pub longitude: f64,
}

fn valid_coordinates(latitude: f64, longitude: f64) -> bool {
    latitude.is_finite()
        && longitude.is_finite()
        && (-90.0..=90.0).contains(&latitude)
        && (-180.0..=180.0).contains(&longitude)
}

fn resolve_import_coordinates(
    exif_latitude: Option<f64>,
    exif_longitude: Option<f64>,
    import_location: Option<ImportLocation>,
) -> (Option<f64>, Option<f64>) {
    if let (Some(latitude), Some(longitude)) = (exif_latitude, exif_longitude) {
        if valid_coordinates(latitude, longitude) {
            return (Some(latitude), Some(longitude));
        }
    }

    if let Some(location) = import_location {
        if valid_coordinates(location.latitude, location.longitude) {
            return (Some(location.latitude), Some(location.longitude));
        }
    }

    (None, None)
}

// Perform import task
pub fn execute_import(
    app_handle: &tauri::AppHandle,
    state: &tauri::State<'_, DbState>,
    imports: Vec<PhotoImportInfo>,
    name_template: &str,
    backup_path: Option<String>,
    import_location: Option<ImportLocation>,
) -> Result<i32, String> {
    let current_path_guard = state.current_path.lock().unwrap();
    let workspace_root_str = match &*current_path_guard {
        Some(path) => path.clone(),
        None => return Err("没有打开的工作空间".to_string()),
    };
    let workspace_root = Path::new(&workspace_root_str);

    let conn_guard = state.conn.lock().unwrap();
    let conn = match &*conn_guard {
        Some(c) => c,
        None => return Err("数据库未连接".to_string()),
    };

    let total = imports.len() as i32;
    let mut copied = 0;
    
    let _ = fs::create_dir_all(workspace_root.join(".photomanager").join("thumbnails"));

    for import in imports {
        let src_path = Path::new(&import.absolute_path);
        if !src_path.exists() {
            continue;
        }

        // Get target album name and folder path
        let album_name = if import.album_name.trim().is_empty() {
            "默认相册".to_string()
        } else {
            import.album_name.trim().to_string()
        };

        let dest_folder_path = workspace_root.join(&album_name);
        let _ = fs::create_dir_all(&dest_folder_path);

        // Get album_id (or create if not exists)
        let album_id = match conn.query_row(
            "SELECT id FROM albums WHERE name = ?1",
            [&album_name],
            |row| row.get::<_, String>(0)
        ) {
            Ok(id) => id,
            Err(_) => {
                let id = Uuid::new_v4().to_string();
                let created_at = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let _ = conn.execute(
                    "INSERT INTO albums (id, name, created_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![&id, &album_name, &created_at]
                );
                id
            }
        };

        // Get file properties
        let metadata = match fs::metadata(src_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_size = metadata.len() as i64;
        let file_ext = src_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let filename = src_path.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
        let is_raw = matches!(file_ext.to_lowercase().as_str(), "arw" | "cr2" | "nef");

        // Parse EXIF
        let exif = read_exif_metadata(src_path);
        let date_taken_str = exif.date_taken.clone().unwrap_or_else(|| {
            let mod_time = metadata.modified().unwrap_or(std::time::SystemTime::now());
            let datetime: chrono::DateTime<Utc> = mod_time.into();
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        });

        // Parse date for template substitution
        let dt_parsed = chrono::NaiveDateTime::parse_from_str(&date_taken_str, "%Y-%m-%d %H:%M:%S")
            .unwrap_or_else(|_| chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap());
        
        let date_str = dt_parsed.format("%Y-%m-%d").to_string();
        let time_str = dt_parsed.format("%H%M%S").to_string();

        // Resolve destination file name
        let mut resolved_filename = name_template.to_string();
        let base_name = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or(&filename);
        resolved_filename = resolved_filename.replace("{time}", &time_str);
        resolved_filename = resolved_filename.replace("{date}", &date_str);
        resolved_filename = resolved_filename.replace("{original}", base_name);
        
        // Add extension
        let final_filename = format!("{}.{}", resolved_filename, file_ext);
        let dest_file_path = dest_folder_path.join(&final_filename);

        // Avoid overwriting by appending index if file exists
        let mut final_dest_path = dest_file_path.clone();
        let mut idx = 1;
        while final_dest_path.exists() {
            let index_filename = format!("{}_{}.{}", resolved_filename, idx, &file_ext);
            final_dest_path = dest_folder_path.join(index_filename);
            idx += 1;
        }

        // 3. Copy to workspace destination
        if let Err(_) = fs::copy(src_path, &final_dest_path) {
            continue;
        }

        // 4. (Optional) Copy to backup destination
        if let Some(ref backup_root_str) = backup_path {
            let backup_root = Path::new(backup_root_str);
            if backup_root.exists() {
                let backup_folder = backup_root.join(&album_name);
                let _ = fs::create_dir_all(&backup_folder);
                let backup_file_path = backup_folder.join(final_dest_path.file_name().unwrap());
                let _ = fs::copy(src_path, backup_file_path);
            }
        }

        // 5. Generate cache thumbnail
        let photo_id = Uuid::new_v4().to_string();
        let cache_file_path = thumbnail_cache_path(workspace_root, &photo_id);

        let (width, height) = match generate_thumbnail(&final_dest_path, &cache_file_path, is_raw) {
            Ok(dims) => dims,
            Err(_) => (exif.width.unwrap_or(0), exif.height.unwrap_or(0))
        };

        // Get relative path for database: "album_name/filename"
        let relative_dest_path = final_dest_path
            .strip_prefix(workspace_root)
            .unwrap_or(&final_dest_path)
            .to_string_lossy()
            .to_string();

        let mod_time = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let file_hash = format!("{}_{}", file_size, mod_time);
        let date_added = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let (latitude, longitude) = resolve_import_coordinates(
            exif.latitude,
            exif.longitude,
            import_location,
        );

        // 6. Write record to database
        let _ = conn.execute(
            "INSERT INTO photos (
                id, path, filename, file_size, file_type, width, height, 
                date_taken, date_added, camera_make, camera_model, lens_model, 
                exposure_time, f_number, iso, focal_length, latitude, longitude, hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            rusqlite::params![
                &photo_id,
                &relative_dest_path,
                &final_dest_path.file_name().unwrap().to_string_lossy().to_string(),
                file_size,
                &file_ext.to_uppercase(),
                width,
                height,
                &date_taken_str,
                &date_added,
                exif.camera_make.clone(),
                exif.camera_model.clone(),
                exif.lens_model.clone(),
                exif.exposure_time.clone(),
                exif.f_number,
                exif.iso,
                exif.focal_length,
                latitude,
                longitude,
                &file_hash,
            ],
        );

        // 7. Insert mapping in album_photos
        let _ = conn.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
            rusqlite::params![&album_id, &photo_id]
        );

        copied += 1;

        // Emit import progress
        let _ = app_handle.emit(
            "import-progress",
            ImportProgress {
                copied,
                total,
                current_file: src_path.file_name().unwrap().to_string_lossy().to_string(),
            },
        );
    }

    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::{resolve_import_coordinates, ImportLocation};

    #[test]
    fn keeps_valid_exif_coordinates() {
        let current = ImportLocation { latitude: 30.0, longitude: 120.0 };
        assert_eq!(
            resolve_import_coordinates(Some(39.9), Some(116.4), Some(current)),
            (Some(39.9), Some(116.4))
        );
    }

    #[test]
    fn fills_missing_coordinates_from_current_location() {
        let current = ImportLocation { latitude: 30.0, longitude: 120.0 };
        assert_eq!(
            resolve_import_coordinates(None, None, Some(current)),
            (Some(30.0), Some(120.0))
        );
    }

    #[test]
    fn rejects_invalid_current_location() {
        let current = ImportLocation { latitude: 91.0, longitude: 120.0 };
        assert_eq!(resolve_import_coordinates(None, None, Some(current)), (None, None));
    }
}
