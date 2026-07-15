use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use crate::db::DbState;

#[cfg(any(target_os = "windows", target_os = "android"))]
// Tauri serves custom protocols on Windows/Android as HTTP localhost origins
// by default. Using HTTPS here bypasses the registered handler entirely.
const MEDIA_ORIGIN: &str = "http://photomanager-media.localhost";
#[cfg(not(any(target_os = "windows", target_os = "android")))]
const MEDIA_ORIGIN: &str = "photomanager-media://localhost";

pub fn photo_thumbnail_url(photo_id: &str) -> String {
    format!("{}/thumbnail/{}", MEDIA_ORIGIN, photo_id)
}

pub fn import_preview_url(cache_key: &str) -> String {
    format!("{}/import-preview/{}.jpg", MEDIA_ORIGIN, cache_key)
}

pub fn import_source_url(source_key: &str) -> String {
    format!("{}/import-source/{}", MEDIA_ORIGIN, source_key)
}

pub fn photo_preview_url(photo_id: &str) -> String {
    format!("{}/preview/{}", MEDIA_ORIGIN, photo_id)
}

fn response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn active_workspace_root<R: Runtime>(app_handle: &AppHandle<R>) -> Option<String> {
    let state = app_handle.state::<DbState>();
    let workspace_root = state.current_path.lock().ok()?.clone();
    workspace_root
}

fn legacy_thumbnail_path(workspace_root: &Path, photo_id: &str) -> PathBuf {
    workspace_root
        .join(".photomanager")
        .join("thumbnails")
        .join(format!("{}.jpg", photo_id))
}

fn read_cached_thumbnail(path: PathBuf) -> std::io::Result<Vec<u8>> {
    let bytes = fs::read(&path)?;
    crate::thumbnail_cache::record_access(&path);
    Ok(bytes)
}

fn valid_import_key(key: &str) -> bool {
    key.len() == 16 && key.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Clone)]
struct ImportSource {
    path: PathBuf,
    is_raw: bool,
}

static IMPORT_SOURCES: OnceLock<Mutex<HashMap<String, ImportSource>>> = OnceLock::new();

fn import_sources() -> &'static Mutex<HashMap<String, ImportSource>> {
    IMPORT_SOURCES.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_import_source(
    source_key: String,
    path: PathBuf,
    is_raw: bool,
) -> Result<(), String> {
    if !valid_import_key(&source_key) || !path.is_file() {
        return Err("无效的导入预览来源".to_string());
    }

    import_sources()
        .lock()
        .map_err(|_| "无法登记导入预览来源".to_string())?
        .insert(source_key, ImportSource { path, is_raw });
    Ok(())
}

fn registered_import_source(source_key: &str) -> Option<ImportSource> {
    import_sources().lock().ok()?.get(source_key).cloned()
}

fn photo_source<R: Runtime>(
    app_handle: &AppHandle<R>,
    workspace_root: &Path,
    photo_id: &str,
) -> Option<(PathBuf, String)> {
    Uuid::parse_str(photo_id).ok()?;
    let state = app_handle.state::<DbState>();
    let conn_guard = state.conn.lock().ok()?;
    let conn = conn_guard.as_ref()?;
    let (relative_path, file_type): (String, String) = conn
        .query_row(
            "SELECT path, file_type FROM photos WHERE id = ?1",
            [photo_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()?;
    Some((workspace_root.join(relative_path), file_type.to_lowercase()))
}

pub fn serve_media_request<R: Runtime>(
    app_handle: &AppHandle<R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() != Method::GET {
        return response(StatusCode::METHOD_NOT_ALLOWED, "text/plain", Vec::new());
    }

    let workspace_root = match active_workspace_root(app_handle) {
        Some(path) => path,
        None => return response(StatusCode::NOT_FOUND, "text/plain", Vec::new()),
    };
    let workspace_root = Path::new(&workspace_root);
    let request_path = request.uri().path().trim_start_matches('/');

    let (content_type, bytes) = if let Some(photo_id) = request_path.strip_prefix("preview/") {
        let Some((file_path, file_type)) = photo_source(app_handle, workspace_root, photo_id) else {
            return response(StatusCode::NOT_FOUND, "text/plain", Vec::new());
        };

        if matches!(file_type.as_str(), "arw" | "cr2" | "nef") {
            match crate::metadata::extract_raw_preview(file_path) {
                Ok(bytes) => ("image/jpeg", Ok(bytes)),
                Err(error) => ("text/plain", Err(error)),
            }
        } else {
            let content_type = if file_type == "png" {
                "image/png"
            } else {
                "image/jpeg"
            };
            (content_type, fs::read(file_path))
        }
    } else if let Some(photo_id) = request_path.strip_prefix("thumbnail/") {
        if Uuid::parse_str(photo_id).is_err() {
            return response(StatusCode::BAD_REQUEST, "text/plain", Vec::new());
        }

        let v2_path = crate::metadata::thumbnail_cache_path(workspace_root, photo_id);
        if v2_path.exists() {
            ("image/jpeg", read_cached_thumbnail(v2_path))
        } else {
            (
                "image/jpeg",
                read_cached_thumbnail(legacy_thumbnail_path(workspace_root, photo_id)),
            )
        }
    } else if let Some(source_key) = request_path.strip_prefix("import-source/") {
        if !valid_import_key(source_key) {
            return response(StatusCode::BAD_REQUEST, "text/plain", Vec::new());
        }
        let Some(source) = registered_import_source(source_key) else {
            return response(StatusCode::NOT_FOUND, "text/plain", Vec::new());
        };

        if source.is_raw {
            match crate::metadata::extract_raw_preview(source.path) {
                Ok(bytes) => ("image/jpeg", Ok(bytes)),
                Err(error) => ("text/plain", Err(error)),
            }
        } else {
            let content_type = match source
                .path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.to_ascii_lowercase())
                .as_deref()
            {
                Some("png") => "image/png",
                _ => "image/jpeg",
            };
            (content_type, fs::read(source.path))
        }
    } else if let Some(filename) = request_path.strip_prefix("import-preview/") {
        let Some(cache_key) = filename.strip_suffix(".jpg") else {
            return response(StatusCode::BAD_REQUEST, "text/plain", Vec::new());
        };
        if !valid_import_key(cache_key) {
            return response(StatusCode::BAD_REQUEST, "text/plain", Vec::new());
        }
        (
            "image/jpeg",
            read_cached_thumbnail(crate::metadata::import_preview_cache_path(
                workspace_root,
                cache_key,
            )),
        )
    } else {
        return response(StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };

    match bytes {
        Ok(bytes) => response(StatusCode::OK, content_type, bytes),
        Err(_) => response(StatusCode::NOT_FOUND, "text/plain", Vec::new()),
    }
}
