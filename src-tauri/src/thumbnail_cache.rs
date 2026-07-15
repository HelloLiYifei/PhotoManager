use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

pub const DEFAULT_MAX_CACHE_BYTES: u64 = 512 * 1024 * 1024;
pub const DEFAULT_MAX_CACHE_FILES: usize = 5_000;

#[derive(Clone, Copy)]
struct CacheLimits {
    max_bytes: u64,
    max_files: usize,
}

impl Default for CacheLimits {
    fn default() -> Self {
        Self {
            max_bytes: DEFAULT_MAX_CACHE_BYTES,
            max_files: DEFAULT_MAX_CACHE_FILES,
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct CachePruneResult {
    pub files_removed: u64,
    pub bytes_freed: u64,
}

#[derive(Clone, Copy)]
struct CacheEntry {
    bytes: u64,
    last_used: SystemTime,
}

#[derive(Default)]
struct CacheIndex {
    entries: HashMap<PathBuf, CacheEntry>,
    total_bytes: u64,
}

static CACHE_INDICES: OnceLock<Mutex<HashMap<PathBuf, CacheIndex>>> = OnceLock::new();
static CACHE_LIMITS: OnceLock<Mutex<HashMap<PathBuf, CacheLimits>>> = OnceLock::new();

fn cache_indices() -> &'static Mutex<HashMap<PathBuf, CacheIndex>> {
    CACHE_INDICES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_limits() -> &'static Mutex<HashMap<PathBuf, CacheLimits>> {
    CACHE_LIMITS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_cache_root(path: &Path) -> PathBuf {
    match path.file_name().and_then(|name| name.to_str()) {
        Some("thumbnails" | "import-previews") => path.parent().unwrap_or(path).to_path_buf(),
        _ => path.to_path_buf(),
    }
}

fn cache_root_for_file(path: &Path) -> Option<PathBuf> {
    path.parent().map(normalize_cache_root)
}

fn scan_cache_directory(index: &mut CacheIndex, path: &Path) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        let bytes = metadata.len();
        let last_used = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        index.total_bytes = index.total_bytes.saturating_add(bytes);
        index.entries.insert(path, CacheEntry { bytes, last_used });
    }
}

fn scan_cache(root: &Path) -> CacheIndex {
    let mut index = CacheIndex::default();
    let thumbnail_root = root.join("thumbnails");
    let import_preview_root = root.join("import-previews");
    if thumbnail_root.is_dir() || import_preview_root.is_dir() {
        scan_cache_directory(&mut index, &thumbnail_root);
        scan_cache_directory(&mut index, &import_preview_root);
    } else {
        // Keeps the cache helper usable for isolated directories and tests.
        scan_cache_directory(&mut index, root);
    }

    index
}

fn prune_to_limits(
    index: &mut CacheIndex,
    max_bytes: u64,
    max_files: usize,
    protected_path: Option<&Path>,
) -> CachePruneResult {
    let mut result = CachePruneResult::default();
    let mut failed_removals = HashSet::new();
    while index.total_bytes > max_bytes || index.entries.len() > max_files {
        let candidate = index
            .entries
            .iter()
            .filter(|(path, _)| protected_path != Some(path.as_path()))
            .filter(|(path, _)| !failed_removals.contains(path.as_path()))
            .min_by_key(|(_, entry)| entry.last_used)
            .map(|(path, entry)| (path.clone(), entry.bytes));
        let Some((path, bytes)) = candidate else {
            break;
        };

        if fs::remove_file(&path).is_ok() || !path.exists() {
            index.entries.remove(&path);
            index.total_bytes = index.total_bytes.saturating_sub(bytes);
            result.files_removed = result.files_removed.saturating_add(1);
            result.bytes_freed = result.bytes_freed.saturating_add(bytes);
        } else {
            // Try other candidates without spinning on a locked/read-only file.
            failed_removals.insert(path);
        }
    }
    result
}

fn with_index<F>(path: &Path, operation: F)
where
    F: FnOnce(&mut CacheIndex),
{
    let Some(root) = cache_root_for_file(path) else {
        return;
    };
    let Ok(mut indices) = cache_indices().lock() else {
        return;
    };
    let index = indices
        .entry(root.clone())
        .or_insert_with(|| scan_cache(&root));
    operation(index);
}

/// Mark a successfully served cache file as recently used.
pub fn record_access(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    let bytes = metadata.len();
    with_index(path, |index| {
        if let Some(previous) = index.entries.insert(
            path.to_path_buf(),
            CacheEntry {
                bytes,
                last_used: SystemTime::now(),
            },
        ) {
            index.total_bytes = index.total_bytes.saturating_sub(previous.bytes);
        }
        index.total_bytes = index.total_bytes.saturating_add(bytes);
    });
}

/// Register a newly generated thumbnail and evict least-recently-used files
/// until both the byte and file-count quotas are satisfied.
pub fn record_write(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    let bytes = metadata.len();
    let limits = cache_root_for_file(path)
        .and_then(|root| cache_limits().lock().ok()?.get(&root).copied())
        .unwrap_or_default();
    with_index(path, |index| {
        if let Some(previous) = index.entries.insert(
            path.to_path_buf(),
            CacheEntry {
                bytes,
                last_used: SystemTime::now(),
            },
        ) {
            index.total_bytes = index.total_bytes.saturating_sub(previous.bytes);
        }
        index.total_bytes = index.total_bytes.saturating_add(bytes);
        let _ = prune_to_limits(index, limits.max_bytes, limits.max_files, Some(path));
    });
}

/// Apply workspace-wide quotas across thumbnails and import previews, pruning
/// least-recently-used files immediately when the new limits are smaller.
pub fn set_limits(root: &Path, max_bytes: u64, max_files: usize) -> CachePruneResult {
    let root = normalize_cache_root(root);
    let limits = CacheLimits {
        max_bytes,
        max_files,
    };
    if let Ok(mut configured_limits) = cache_limits().lock() {
        configured_limits.insert(root.clone(), limits);
    }

    let Ok(mut indices) = cache_indices().lock() else {
        return CachePruneResult::default();
    };
    let index = indices
        .entry(root.clone())
        .or_insert_with(|| scan_cache(&root));
    prune_to_limits(index, max_bytes, max_files, None)
}

pub fn forget(path: &Path) {
    with_index(path, |index| {
        if let Some(entry) = index.entries.remove(path) {
            index.total_bytes = index.total_bytes.saturating_sub(entry.bytes);
        }
    });
}

pub fn invalidate(root: &Path) {
    let root = normalize_cache_root(root);
    if let Ok(mut indices) = cache_indices().lock() {
        indices.remove(&root);
    }
}

#[cfg(test)]
mod tests {
    use super::{prune_to_limits, record_write, set_limits, CacheEntry, CacheIndex};
    use std::fs;
    use std::time::{Duration, SystemTime};

    fn temp_cache_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "photomanager-thumbnail-lru-test-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn prunes_the_least_recent_file_to_both_limits() {
        let root = temp_cache_dir();
        fs::create_dir_all(&root).expect("create fixture");
        let old = root.join("old.jpg");
        let middle = root.join("middle.jpg");
        let recent = root.join("recent.jpg");
        for path in [&old, &middle, &recent] {
            fs::write(path, [0_u8; 4]).expect("write fixture");
        }

        let start = SystemTime::UNIX_EPOCH;
        let mut index = CacheIndex::default();
        index.total_bytes = 12;
        index.entries.insert(
            old.clone(),
            CacheEntry {
                bytes: 4,
                last_used: start,
            },
        );
        index.entries.insert(
            middle.clone(),
            CacheEntry {
                bytes: 4,
                last_used: start + Duration::from_secs(1),
            },
        );
        index.entries.insert(
            recent.clone(),
            CacheEntry {
                bytes: 4,
                last_used: start + Duration::from_secs(2),
            },
        );

        prune_to_limits(&mut index, 8, 2, None);

        assert!(!old.exists());
        assert!(middle.exists());
        assert!(recent.exists());
        assert_eq!(index.total_bytes, 8);
        assert_eq!(index.entries.len(), 2);
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn never_evicts_the_file_being_generated() {
        let root = temp_cache_dir();
        fs::create_dir_all(&root).expect("create fixture");
        let protected = root.join("protected.jpg");
        let newer = root.join("newer.jpg");
        fs::write(&protected, [0_u8; 4]).expect("write protected fixture");
        fs::write(&newer, [0_u8; 4]).expect("write newer fixture");

        let mut index = CacheIndex::default();
        index.total_bytes = 8;
        index.entries.insert(
            protected.clone(),
            CacheEntry {
                bytes: 4,
                last_used: SystemTime::UNIX_EPOCH,
            },
        );
        index.entries.insert(
            newer.clone(),
            CacheEntry {
                bytes: 4,
                last_used: SystemTime::UNIX_EPOCH + Duration::from_secs(1),
            },
        );

        prune_to_limits(&mut index, 4, 1, Some(&protected));

        assert!(protected.exists());
        assert!(!newer.exists());
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn configurable_limits_cover_both_workspace_cache_directories() {
        let root = temp_cache_dir();
        let thumbnails = root.join("thumbnails");
        let import_previews = root.join("import-previews");
        fs::create_dir_all(&thumbnails).expect("create thumbnail cache");
        fs::create_dir_all(&import_previews).expect("create import preview cache");

        let first = thumbnails.join("first.jpg");
        let second = import_previews.join("second.jpg");
        let third = thumbnails.join("third.jpg");
        for path in [&first, &second, &third] {
            fs::write(path, [0_u8; 4]).expect("write cache fixture");
            record_write(path);
        }

        let result = set_limits(&root, 8, 2);
        let remaining = [&first, &second, &third]
            .into_iter()
            .filter(|path| path.exists())
            .count();

        assert_eq!(remaining, 2);
        assert_eq!(result.files_removed, 1);
        assert_eq!(result.bytes_freed, 4);
        fs::remove_dir_all(root).expect("remove fixture");
    }
}
