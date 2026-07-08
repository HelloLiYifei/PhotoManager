pub mod db;
pub mod workspace;
pub mod metadata;
pub mod scan;
pub mod import;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::get_photo_thumbnail_base64,
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
            commands::select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
