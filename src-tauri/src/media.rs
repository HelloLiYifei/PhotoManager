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

fn response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "image/jpeg")
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

pub fn serve_media_request<R: Runtime>(
    app_handle: &AppHandle<R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() != Method::GET {
        return response(StatusCode::METHOD_NOT_ALLOWED, Vec::new());
    }

    let workspace_root = match active_workspace_root(app_handle) {
        Some(path) => path,
        None => return response(StatusCode::NOT_FOUND, Vec::new()),
    };
    let workspace_root = Path::new(&workspace_root);
    let request_path = request.uri().path().trim_start_matches('/');

    let file_path = if let Some(photo_id) = request_path.strip_prefix("thumbnail/") {
        if Uuid::parse_str(photo_id).is_err() {
            return response(StatusCode::BAD_REQUEST, Vec::new());
        }

        let v2_path = crate::metadata::thumbnail_cache_path(workspace_root, photo_id);
        if v2_path.exists() {
            v2_path
        } else {
            legacy_thumbnail_path(workspace_root, photo_id)
        }
    } else if let Some(filename) = request_path.strip_prefix("import-preview/") {
        let Some(cache_key) = filename.strip_suffix(".jpg") else {
            return response(StatusCode::BAD_REQUEST, Vec::new());
        };
        if !valid_import_key(cache_key) {
            return response(StatusCode::BAD_REQUEST, Vec::new());
        }
        crate::metadata::import_preview_cache_path(workspace_root, cache_key)
    } else {
        return response(StatusCode::NOT_FOUND, Vec::new());
    };

    match fs::read(file_path) {
        Ok(bytes) => response(StatusCode::OK, bytes),
        Err(_) => response(StatusCode::NOT_FOUND, Vec::new()),
    }
}
