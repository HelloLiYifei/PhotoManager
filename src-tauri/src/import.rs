use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::path::Path;
use tauri::Emitter;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::db::DbState;
use crate::metadata::{read_image_metadata, ImageMetadata};
use crate::scan::is_supported_image;
use rusqlite::Connection;

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
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub exposure_time: Option<String>,
    pub f_number: Option<f64>,
    pub iso: Option<i32>,
    pub focal_length: Option<f64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub is_raw: bool,
    pub already_imported: bool,
}

fn card_photo_metadata(path: &Path, is_raw: bool) -> ImageMetadata {
    read_image_metadata(path, is_raw)
}

#[cfg(test)]
fn card_photo_dimensions(path: &Path, is_raw: bool) -> (Option<i32>, Option<i32>) {
    let metadata = card_photo_metadata(path, is_raw);
    (metadata.width, metadata.height)
}

fn normalized_import_identity(filename: &str, size: i64) -> (String, i64) {
    (filename.to_lowercase(), size)
}

fn destination_filename(src_path: &Path, collision_index: usize) -> String {
    let original_name = src_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown");
    if collision_index == 0 {
        return original_name.to_string();
    }

    let stem = src_path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(original_name);
    match src_path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if !extension.is_empty() => {
            format!("{}_{}.{}", stem, collision_index, extension)
        }
        _ => format!("{}_{}", stem, collision_index),
    }
}

fn copy_file_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    let destination_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("photo");
    let temporary_path = destination.with_file_name(format!(
        ".{}.{}.part",
        destination_name,
        Uuid::new_v4()
    ));

    let result = (|| {
        let expected_size = fs::metadata(source)
            .map_err(|error| format!("无法读取源文件：{}", error))?
            .len();
        let copied_size = fs::copy(source, &temporary_path)
            .map_err(|error| format!("复制数据失败：{}", error))?;
        if copied_size != expected_size {
            return Err(format!(
                "复制后的文件大小不一致（应为 {} 字节，实际为 {} 字节）",
                expected_size, copied_size
            ));
        }
        OpenOptions::new()
            .write(true)
            .open(&temporary_path)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("写入磁盘失败：{}", error))?;
        fs::rename(&temporary_path, destination)
            .map_err(|error| format!("完成文件写入失败：{}", error))?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn interrupted_import_error(
    copied: i32,
    total: i32,
    source: &Path,
    detail: impl std::fmt::Display,
) -> String {
    format!(
        "导入中断（已完成 {}/{}）：{}：{}。涂色记录已保留，可重新插入存储卡后继续。",
        copied,
        total,
        source.file_name().unwrap_or_default().to_string_lossy(),
        detail
    )
}

fn metadata_fingerprint(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("{}_{}", metadata.len(), modified)
}

#[derive(Default)]
struct ImportedFileIndex {
    identities: HashSet<(String, i64)>,
    fingerprints: HashSet<String>,
}

impl ImportedFileIndex {
    fn contains(&self, filename: &str, size: i64, fingerprint: &str) -> bool {
        self.identities
            .contains(&normalized_import_identity(filename, size))
            || self.fingerprints.contains(fingerprint)
    }
}

fn load_imported_file_index(conn: &Connection) -> ImportedFileIndex {
    let mut stmt = match conn
        .prepare("SELECT COALESCE(source_filename, filename), file_size, hash FROM photos")
    {
        Ok(stmt) => stmt,
        Err(_) => return ImportedFileIndex::default(),
    };

    let rows = match stmt.query_map([], |row| {
        let filename = row.get::<_, String>(0)?;
        let size = row.get::<_, i64>(1)?;
        let fingerprint = row.get::<_, Option<String>>(2)?;
        Ok((normalized_import_identity(&filename, size), fingerprint))
    }) {
        Ok(rows) => rows,
        Err(_) => return ImportedFileIndex::default(),
    };

    let mut index = ImportedFileIndex::default();
    for (identity, fingerprint) in rows.flatten() {
        index.identities.insert(identity);
        if let Some(fingerprint) = fingerprint {
            index.fingerprints.insert(fingerprint);
        }
    }
    index
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
                        let label = path
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("存储卡")
                            .to_string();
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
    let existing_files = conn.map(load_imported_file_index).unwrap_or_default();

    let mut photos = Vec::new();
    for entry in WalkDir::new(scan_root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if is_supported_image(ext) {
                    let absolute_path = entry.path().to_string_lossy().to_string();
                    let relative_path = entry
                        .path()
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

                    // Read EXIF once for both layout dimensions and the import
                    // lightbox's read-only photo details.
                    let photo_metadata = card_photo_metadata(entry.path(), is_raw);
                    let mod_time = metadata.modified().unwrap_or(std::time::SystemTime::now());
                    let datetime: chrono::DateTime<Utc> = mod_time.into();
                    let date_taken = photo_metadata
                        .date_taken
                        .clone()
                        .unwrap_or_else(|| datetime.format("%Y-%m-%d %H:%M:%S").to_string());

                    let filename = entry
                        .path()
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let fingerprint = metadata_fingerprint(&metadata);
                    let already_imported = existing_files.contains(&filename, size, &fingerprint);

                    photos.push(CardPhoto {
                        relative_path,
                        absolute_path,
                        size,
                        date_taken,
                        width: photo_metadata.width,
                        height: photo_metadata.height,
                        camera_make: photo_metadata.camera_make,
                        camera_model: photo_metadata.camera_model,
                        lens_model: photo_metadata.lens_model,
                        exposure_time: photo_metadata.exposure_time,
                        f_number: photo_metadata.f_number,
                        iso: photo_metadata.iso,
                        focal_length: photo_metadata.focal_length,
                        latitude: photo_metadata.latitude,
                        longitude: photo_metadata.longitude,
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
    let mut imported_files = load_imported_file_index(conn);

    fs::create_dir_all(workspace_root.join(".photomanager").join("thumbnails"))
        .map_err(|error| format!("无法准备工作区缓存目录：{}", error))?;

    let backup_root = backup_path.as_deref().map(Path::new);
    if let Some(path) = backup_root {
        if !path.is_dir() {
            return Err(format!("备份目录不可用：{}", path.to_string_lossy()));
        }
    }

    for import in imports {
        let src_path = Path::new(&import.absolute_path);
        if !src_path.exists() {
            return Err(interrupted_import_error(
                copied,
                total,
                src_path,
                "源文件或存储卡已断开",
            ));
        }

        // Get target album name and folder path
        let album_name = if import.album_name.trim().is_empty() {
            "默认相册".to_string()
        } else {
            import.album_name.trim().to_string()
        };

        let dest_folder_path = workspace_root.join(&album_name);
        fs::create_dir_all(&dest_folder_path).map_err(|error| {
            interrupted_import_error(copied, total, src_path, format!("无法创建目标目录：{}", error))
        })?;

        // Get album_id (or create if not exists)
        let album_id = match conn.query_row(
            "SELECT id FROM albums WHERE name = ?1",
            [&album_name],
            |row| row.get::<_, String>(0),
        ) {
            Ok(id) => id,
            Err(_) => {
                let id = Uuid::new_v4().to_string();
                let created_at = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                conn.execute(
                    "INSERT INTO albums (id, name, created_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![&id, &album_name, &created_at],
                )
                .map_err(|error| {
                    interrupted_import_error(
                        copied,
                        total,
                        src_path,
                        format!("无法创建目标相册：{}", error),
                    )
                })?;
                id
            }
        };

        // Get file properties
        let metadata = fs::metadata(src_path).map_err(|error| {
            interrupted_import_error(copied, total, src_path, format!("无法读取源文件：{}", error))
        })?;

        let file_size = metadata.len() as i64;
        let file_ext = src_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let filename = src_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let is_raw = matches!(file_ext.to_lowercase().as_str(), "arw" | "cr2" | "nef");

        // Re-check at execution time as the import list may be stale or may
        // come from a caller other than the wizard.
        let source_identity = normalized_import_identity(&filename, file_size);
        let source_fingerprint = metadata_fingerprint(&metadata);
        if imported_files.contains(&filename, file_size, &source_fingerprint) {
            continue;
        }

        // Parse metadata without decoding the full source. The thumbnail is
        // generated later, only when the photo becomes visible.
        let exif = read_image_metadata(src_path, is_raw);
        let date_taken_str = exif.date_taken.clone().unwrap_or_else(|| {
            let mod_time = metadata.modified().unwrap_or(std::time::SystemTime::now());
            let datetime: chrono::DateTime<Utc> = mod_time.into();
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        });

        // Preserve the source filename. A numeric suffix is added only when
        // necessary to avoid overwriting an existing file in the album.
        let dest_file_path = dest_folder_path.join(destination_filename(src_path, 0));

        // Avoid overwriting by appending index if file exists
        let mut final_dest_path = dest_file_path.clone();
        let mut idx = 1;
        while final_dest_path.exists() {
            final_dest_path = dest_folder_path.join(destination_filename(src_path, idx));
            idx += 1;
        }

        // 3. Copy to workspace destination
        copy_file_atomically(src_path, &final_dest_path).map_err(|error| {
            interrupted_import_error(copied, total, src_path, error)
        })?;

        // 4. (Optional) Copy to backup destination
        let mut completed_backup_path = None;
        if let Some(backup_root) = backup_root {
            let backup_folder = backup_root.join(&album_name);
            if let Err(error) = fs::create_dir_all(&backup_folder) {
                let _ = fs::remove_file(&final_dest_path);
                return Err(interrupted_import_error(
                    copied,
                    total,
                    src_path,
                    format!("无法创建备份目录：{}", error),
                ));
            }
            let backup_file_path = backup_folder.join(final_dest_path.file_name().unwrap());
            if let Err(error) = copy_file_atomically(src_path, &backup_file_path) {
                let _ = fs::remove_file(&final_dest_path);
                return Err(interrupted_import_error(copied, total, src_path, error));
            }
            completed_backup_path = Some(backup_file_path);
        }

        // 5. Register the photo. No thumbnail file is created during import.
        let photo_id = Uuid::new_v4().to_string();
        let width = exif.width.unwrap_or(0);
        let height = exif.height.unwrap_or(0);

        // Get relative path for database: "album_name/filename"
        let relative_dest_path = final_dest_path
            .strip_prefix(workspace_root)
            .unwrap_or(&final_dest_path)
            .to_string_lossy()
            .to_string();

        let date_added = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let (latitude, longitude) =
            resolve_import_coordinates(exif.latitude, exif.longitude, import_location);

        // 6. Write record to database
        if let Err(error) = conn.execute(
            "INSERT INTO photos (
                id, path, filename, source_filename, file_size, file_type, width, height,
                date_taken, date_added, camera_make, camera_model, lens_model, 
                exposure_time, f_number, iso, focal_length, latitude, longitude, hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            rusqlite::params![
                &photo_id,
                &relative_dest_path,
                &final_dest_path.file_name().unwrap().to_string_lossy().to_string(),
                &filename,
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
                &source_fingerprint,
            ],
        ) {
            let _ = fs::remove_file(&final_dest_path);
            if let Some(path) = &completed_backup_path {
                let _ = fs::remove_file(path);
            }
            return Err(interrupted_import_error(
                copied,
                total,
                src_path,
                format!("无法注册照片：{}", error),
            ));
        }

        // 7. Insert mapping in album_photos
        if let Err(error) = conn.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
            rusqlite::params![&album_id, &photo_id],
        ) {
            let _ = conn.execute("DELETE FROM photos WHERE id = ?1", [&photo_id]);
            let _ = fs::remove_file(&final_dest_path);
            if let Some(path) = &completed_backup_path {
                let _ = fs::remove_file(path);
            }
            return Err(interrupted_import_error(
                copied,
                total,
                src_path,
                format!("无法加入目标相册：{}", error),
            ));
        }

        copied += 1;
        imported_files.identities.insert(source_identity);
        imported_files.fingerprints.insert(source_fingerprint);

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
    use super::{
        card_photo_dimensions, copy_file_atomically, destination_filename, load_imported_file_index,
        normalized_import_identity, resolve_import_coordinates, scan_card_files, ImportLocation,
    };
    use rusqlite::Connection;

    #[test]
    fn preserves_source_filename_and_only_suffixes_collisions() {
        let source = std::path::Path::new("D:/DCIM/IMG_0001.JPG");
        assert_eq!(destination_filename(source, 0), "IMG_0001.JPG");
        assert_eq!(destination_filename(source, 2), "IMG_0001_2.JPG");
    }

    #[test]
    fn copies_through_a_temporary_file_and_cleans_failed_attempts() {
        let root = std::env::temp_dir().join(format!(
            "photomanager-atomic-copy-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("source.jpg");
        let destination = root.join("destination.jpg");
        std::fs::write(&source, b"complete image bytes").unwrap();

        copy_file_atomically(&source, &destination).unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"complete image bytes");
        assert!(std::fs::read_dir(&root)
            .unwrap()
            .all(|entry| !entry.unwrap().file_name().to_string_lossy().ends_with(".part")));

        let missing_destination = root.join("missing.jpg");
        assert!(copy_file_atomically(&root.join("missing-source.jpg"), &missing_destination).is_err());
        assert!(!missing_destination.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn reads_card_dimensions_before_thumbnail_loading() {
        let path = std::env::temp_dir().join(format!(
            "photomanager-card-dimensions-{}.png",
            uuid::Uuid::new_v4()
        ));
        image::RgbImage::new(12, 20).save(&path).unwrap();

        assert_eq!(card_photo_dimensions(&path, false), (Some(12), Some(20)));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn scans_card_details_and_falls_back_to_file_time_without_exif() {
        let root = std::env::temp_dir().join(format!(
            "photomanager-card-details-{}",
            uuid::Uuid::new_v4()
        ));
        let dcim = root.join("DCIM");
        std::fs::create_dir_all(&dcim).unwrap();
        let path = dcim.join("plain.png");
        image::RgbImage::new(18, 12).save(&path).unwrap();

        let photos = scan_card_files(root.to_str().unwrap(), None);
        assert_eq!(photos.len(), 1);
        let photo = &photos[0];
        assert_eq!(photo.width, Some(18));
        assert_eq!(photo.height, Some(12));
        assert!(!photo.date_taken.is_empty());
        assert_eq!(photo.camera_make, None);
        assert_eq!(photo.latitude, None);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn detects_an_import_after_the_destination_was_renamed() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE photos (filename TEXT, source_filename TEXT, file_size INTEGER, hash TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (filename, source_filename, file_size, hash) VALUES (?1, ?2, ?3, NULL)",
            rusqlite::params!["2026-07-11_IMG_0001.JPG", "IMG_0001.JPG", 42_i64],
        )
        .unwrap();

        let index = load_imported_file_index(&conn);
        assert!(index
            .identities
            .contains(&normalized_import_identity("img_0001.jpg", 42)));
    }

    #[test]
    fn falls_back_to_destination_name_for_legacy_imports() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE photos (filename TEXT, source_filename TEXT, file_size INTEGER, hash TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (filename, source_filename, file_size, hash) VALUES (?1, NULL, ?2, NULL)",
            rusqlite::params!["IMG_0002.JPG", 84_i64],
        )
        .unwrap();

        let index = load_imported_file_index(&conn);
        assert!(index
            .identities
            .contains(&normalized_import_identity("IMG_0002.JPG", 84)));
    }

    #[test]
    fn detects_a_renamed_legacy_import_by_fingerprint() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE photos (filename TEXT, source_filename TEXT, file_size INTEGER, hash TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (filename, source_filename, file_size, hash) VALUES (?1, NULL, ?2, ?3)",
            rusqlite::params!["120000_IMG_0003.JPG", 126_i64, "126_1720670400"],
        )
        .unwrap();

        let index = load_imported_file_index(&conn);
        assert!(index.contains("IMG_0003.JPG", 126, "126_1720670400"));
    }

    #[test]
    fn keeps_valid_exif_coordinates() {
        let current = ImportLocation {
            latitude: 30.0,
            longitude: 120.0,
        };
        assert_eq!(
            resolve_import_coordinates(Some(39.9), Some(116.4), Some(current)),
            (Some(39.9), Some(116.4))
        );
    }

    #[test]
    fn fills_missing_coordinates_from_current_location() {
        let current = ImportLocation {
            latitude: 30.0,
            longitude: 120.0,
        };
        assert_eq!(
            resolve_import_coordinates(None, None, Some(current)),
            (Some(30.0), Some(120.0))
        );
    }

    #[test]
    fn rejects_invalid_current_location() {
        let current = ImportLocation {
            latitude: 91.0,
            longitude: 120.0,
        };
        assert_eq!(
            resolve_import_coordinates(None, None, Some(current)),
            (None, None)
        );
    }
}
