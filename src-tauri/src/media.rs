use std::fs;
use std::path::{Path, PathBuf};

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

fn valid_import_key(key: &str) -> bool {
    key.len() == 16 && key.bytes().all(|byte| byte.is_ascii_hexdigit())
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
            ("image/jpeg", fs::read(v2_path))
        } else {
            (
                "image/jpeg",
                fs::read(legacy_thumbnail_path(workspace_root, photo_id)),
            )
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
            fs::read(crate::metadata::import_preview_cache_path(
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
