pub mod db;
pub mod workspace;
pub mod metadata;
pub mod scan;
pub mod import;
pub mod commands;
pub mod media;
pub mod shell_thumbnail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("photomanager-media", |context, request| {
            media::serve_media_request(context.app_handle(), request)
        })
        .manage(db::DbState {
            conn: std::sync::Mutex::new(None),
            current_path: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspaces,
            commands::create_workspace,
            commands::open_workspace,
            commands::delete_workspace,
            commands::get_active_workspace,
            commands::get_photos,
            commands::toggle_favorite,
            commands::update_rating,
            commands::delete_photo,
            commands::permanently_delete_photo,
            commands::get_photo_thumbnail_url,
            commands::get_photo_preview_base64,
            commands::get_albums,
            commands::create_album,
            commands::delete_album,
            commands::add_photos_to_album,
            commands::remove_photos_from_album,
            commands::scan_workspace,
            commands::detect_cards,
            commands::scan_card,
            commands::import_photos,
            commands::select_directory,
            commands::get_image_thumbnail_url,
            commands::move_photos_to_album,
            commands::add_tag_to_photo,
            commands::remove_tag_from_photo,
            commands::get_photo_tags,
            commands::get_all_tags,
            commands::permanently_delete_photos,
            commands::restore_photos,
            commands::empty_trash_to_recycle_bin,
            commands::export_photos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
