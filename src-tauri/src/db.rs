use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
    pub current_path: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Photo {
    pub id: String,
    pub path: String, // Relative to workspace root
    pub filename: String,
    pub file_size: i64,
    pub file_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub date_taken: Option<String>,
    pub date_added: String,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub exposure_time: Option<String>,
    pub f_number: Option<f64>,
    pub iso: Option<i32>,
    pub focal_length: Option<f64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub rating: i32,
    pub is_favorite: bool,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Album {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub cover_photo_id: Option<String>,
    pub photo_count: Option<i32>,
}

pub fn init_db(conn: &Connection) -> Result<()> {
    // 1. Create photos table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            source_filename TEXT,
            file_size INTEGER NOT NULL,
            file_type TEXT NOT NULL,
            width INTEGER,
            height INTEGER,
            date_taken TEXT,
            date_added TEXT NOT NULL,
            camera_make TEXT,
            camera_model TEXT,
            lens_model TEXT,
            exposure_time TEXT,
            f_number REAL,
            iso INTEGER,
            focal_length REAL,
            latitude REAL,
            longitude REAL,
            rating INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            hash TEXT
        )",
        [],
    )?;

    // Existing workspaces predate source_filename. Keeping the original card
    // name lets duplicate detection continue to work when imports are renamed.
    let _ = conn.execute("ALTER TABLE photos ADD COLUMN source_filename TEXT", []);

    // Create indexes for fast queries
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(date_taken)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_is_deleted ON photos(is_deleted)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_hash ON photos(hash)", [])?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_photos_import_identity ON photos(source_filename, file_size)",
        [],
    )?;

    // 2. Create albums table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            cover_photo_id TEXT
        )",
        [],
    )?;

    // 3. Create album_photos mapping table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS album_photos (
            album_id TEXT NOT NULL,
            photo_id TEXT NOT NULL,
            PRIMARY KEY (album_id, photo_id),
            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
            FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id)", [])?;

    // 4. Create tags table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        )",
        [],
    )?;

    // 5. Create photo_tags mapping table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photo_tags (
            photo_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (photo_id, tag_id),
            FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON photo_tags(photo_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id)", [])?;

    Ok(())
}

// Helper to map a row to a Photo struct
pub fn map_row_to_photo(row: &rusqlite::Row) -> Result<Photo> {
    let is_favorite: i32 = row.get("is_favorite")?;
    let is_deleted: i32 = row.get("is_deleted")?;
    Ok(Photo {
        id: row.get("id")?,
        path: row.get("path")?,
        filename: row.get("filename")?,
        file_size: row.get("file_size")?,
        file_type: row.get("file_type")?,
        width: row.get("width")?,
        height: row.get("height")?,
        date_taken: row.get("date_taken")?,
        date_added: row.get("date_added")?,
        camera_make: row.get("camera_make")?,
        camera_model: row.get("camera_model")?,
        lens_model: row.get("lens_model")?,
        exposure_time: row.get("exposure_time")?,
        f_number: row.get("f_number")?,
        iso: row.get("iso")?,
        focal_length: row.get("focal_length")?,
        latitude: row.get("latitude")?,
        longitude: row.get("longitude")?,
        rating: row.get("rating")?,
        is_favorite: is_favorite != 0,
        is_deleted: is_deleted != 0,
        deleted_at: row.get("deleted_at")?,
        hash: row.get("hash")?,
    })
}
