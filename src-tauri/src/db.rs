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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AlbumSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_photo_id: Option<String>,
    pub photo_count: i64,
}

pub fn query_album_summaries(conn: &Connection) -> Result<Vec<AlbumSummary>> {
    let mut stmt = conn.prepare(
        "WITH ranked_photos AS (
            SELECT
                ap.album_id,
                p.id AS photo_id,
                COUNT(*) OVER (PARTITION BY ap.album_id) AS photo_count,
                ROW_NUMBER() OVER (
                    PARTITION BY ap.album_id
                    ORDER BY p.date_taken DESC, p.date_added DESC, p.id ASC
                ) AS cover_rank
            FROM album_photos ap
            INNER JOIN photos p ON p.id = ap.photo_id
            WHERE p.is_deleted = 0
        )
        SELECT
            a.id,
            a.name,
            a.description,
            rp.photo_id AS cover_photo_id,
            COALESCE(rp.photo_count, 0) AS photo_count
        FROM albums a
        LEFT JOIN ranked_photos rp
            ON rp.album_id = a.id AND rp.cover_rank = 1
        ORDER BY a.name ASC, a.id ASC",
    )?;

    let summaries = stmt.query_map([], |row| {
        Ok(AlbumSummary {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            cover_photo_id: row.get("cover_photo_id")?,
            photo_count: row.get("photo_count")?,
        })
    })?;

    summaries.collect()
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

#[cfg(test)]
mod tests {
    use super::{init_db, query_album_summaries, AlbumSummary};
    use rusqlite::{params, Connection};
    use serde_json::json;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        init_db(&conn).expect("initialize database");
        conn
    }

    fn insert_album(
        conn: &Connection,
        id: &str,
        name: &str,
        description: Option<&str>,
        stored_cover_id: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO albums (id, name, description, created_at, cover_photo_id)
             VALUES (?1, ?2, ?3, '2026-01-01 00:00:00', ?4)",
            params![id, name, description, stored_cover_id],
        )
        .expect("insert album");
    }

    fn insert_photo(
        conn: &Connection,
        id: &str,
        date_taken: Option<&str>,
        date_added: &str,
        is_deleted: bool,
    ) {
        conn.execute(
            "INSERT INTO photos (
                id, path, filename, file_size, file_type,
                date_taken, date_added, is_deleted
             ) VALUES (?1, ?2, ?3, 1, 'jpg', ?4, ?5, ?6)",
            params![
                id,
                format!("photos/{id}.jpg"),
                format!("{id}.jpg"),
                date_taken,
                date_added,
                if is_deleted { 1 } else { 0 }
            ],
        )
        .expect("insert photo");
    }

    fn add_photo_to_album(conn: &Connection, album_id: &str, photo_id: &str) {
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
            params![album_id, photo_id],
        )
        .expect("add photo to album");
    }

    #[test]
    fn includes_empty_albums() {
        let conn = test_connection();
        insert_album(&conn, "empty", "Empty", Some("No photos"), None);

        let summaries = query_album_summaries(&conn).expect("query summaries");

        assert_eq!(
            summaries,
            vec![AlbumSummary {
                id: "empty".into(),
                name: "Empty".into(),
                description: Some("No photos".into()),
                cover_photo_id: None,
                photo_count: 0,
            }]
        );
    }

    #[test]
    fn returns_multiple_albums_with_independent_counts() {
        let conn = test_connection();
        insert_album(&conn, "z", "Zebra", None, None);
        insert_album(&conn, "a", "Alpha", None, None);
        insert_photo(
            &conn,
            "alpha-1",
            Some("2026-01-01 00:00:00"),
            "2026-01-01 00:00:00",
            false,
        );
        insert_photo(
            &conn,
            "zebra-1",
            Some("2026-02-01 00:00:00"),
            "2026-02-01 00:00:00",
            false,
        );
        insert_photo(
            &conn,
            "zebra-2",
            Some("2026-03-01 00:00:00"),
            "2026-03-01 00:00:00",
            false,
        );
        add_photo_to_album(&conn, "a", "alpha-1");
        add_photo_to_album(&conn, "z", "zebra-1");
        add_photo_to_album(&conn, "z", "zebra-2");

        let summaries = query_album_summaries(&conn).expect("query summaries");

        assert_eq!(
            summaries
                .iter()
                .map(|summary| (summary.name.as_str(), summary.photo_count))
                .collect::<Vec<_>>(),
            vec![("Alpha", 1), ("Zebra", 2)]
        );
        assert_eq!(summaries[1].cover_photo_id.as_deref(), Some("zebra-2"));
    }

    #[test]
    fn ignores_soft_deleted_photos_for_count_and_cover() {
        let conn = test_connection();
        insert_album(&conn, "album", "Album", None, Some("deleted"));
        insert_photo(
            &conn,
            "visible",
            Some("2026-01-01 00:00:00"),
            "2026-01-01 00:00:00",
            false,
        );
        insert_photo(
            &conn,
            "deleted",
            Some("2026-12-01 00:00:00"),
            "2026-12-01 00:00:00",
            true,
        );
        add_photo_to_album(&conn, "album", "visible");
        add_photo_to_album(&conn, "album", "deleted");

        let summaries = query_album_summaries(&conn).expect("query summaries");

        assert_eq!(summaries[0].photo_count, 1);
        assert_eq!(summaries[0].cover_photo_id.as_deref(), Some("visible"));
    }

    #[test]
    fn replaces_an_invalid_stored_cover_with_a_valid_album_photo() {
        let conn = test_connection();
        insert_album(&conn, "album", "Album", None, Some("missing-photo"));
        insert_photo(
            &conn,
            "valid",
            Some("2026-01-01 00:00:00"),
            "2026-01-01 00:00:00",
            false,
        );
        add_photo_to_album(&conn, "album", "valid");

        let summaries = query_album_summaries(&conn).expect("query summaries");

        assert_eq!(summaries[0].cover_photo_id.as_deref(), Some("valid"));
    }

    #[test]
    fn chooses_covers_with_stable_date_and_id_ordering() {
        let conn = test_connection();
        insert_album(&conn, "taken", "1 Taken", None, None);
        insert_album(&conn, "added", "2 Added", None, None);
        insert_album(&conn, "id", "3 Id", None, None);

        for (id, date_taken, date_added) in [
            ("taken-old", "2026-01-01 00:00:00", "2026-12-01 00:00:00"),
            ("taken-new", "2026-02-01 00:00:00", "2026-01-01 00:00:00"),
            ("added-old", "2026-03-01 00:00:00", "2026-03-01 00:00:00"),
            ("added-new", "2026-03-01 00:00:00", "2026-04-01 00:00:00"),
            ("id-b", "2026-05-01 00:00:00", "2026-05-01 00:00:00"),
            ("id-a", "2026-05-01 00:00:00", "2026-05-01 00:00:00"),
        ] {
            insert_photo(&conn, id, Some(date_taken), date_added, false);
        }

        for photo_id in ["taken-old", "taken-new"] {
            add_photo_to_album(&conn, "taken", photo_id);
        }
        for photo_id in ["added-old", "added-new"] {
            add_photo_to_album(&conn, "added", photo_id);
        }
        for photo_id in ["id-b", "id-a"] {
            add_photo_to_album(&conn, "id", photo_id);
        }

        let summaries = query_album_summaries(&conn).expect("query summaries");
        let covers = summaries
            .iter()
            .map(|summary| summary.cover_photo_id.as_deref())
            .collect::<Vec<_>>();

        assert_eq!(
            covers,
            vec![Some("taken-new"), Some("added-new"), Some("id-a")]
        );
    }

    #[test]
    fn serializes_summary_fields_as_camel_case() {
        let summary = AlbumSummary {
            id: "album".into(),
            name: "Album".into(),
            description: None,
            cover_photo_id: Some("photo".into()),
            photo_count: 2,
        };

        assert_eq!(
            serde_json::to_value(summary).expect("serialize summary"),
            json!({
                "id": "album",
                "name": "Album",
                "description": null,
                "coverPhotoId": "photo",
                "photoCount": 2
            })
        );
    }
}
