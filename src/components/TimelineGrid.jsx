import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// Sub-component to lazy load base64 thumbnails
function ThumbnailImage({ id, alt }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef(null);

  useEffect(() => {
    let active = true;
    
    // Intersection Observer to lazy load only when visible!
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadThumbnail();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    async function loadThumbnail() {
      try {
        const b64 = await invoke("get_photo_thumbnail_base64", { id });
        if (active) {
          setSrc(b64);
          setLoading(false);
        }
      } catch (err) {
        // Fallback or ignore
        if (active) setLoading(false);
      }
    }

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id]);

  if (loading) {
    return <div ref={imgRef} className="photo-card-img" style={{ background: "#1A1A24", display: "flex", alignItems: "center", justifyItems: "center" }} />;
  }

  return (
    <img
      ref={imgRef}
      src={src || "/placeholder.svg"}
      alt={alt}
      className="photo-card-img"
      loading="lazy"
    />
  );
}

export default function TimelineGrid({
  currentView, // "photos", "favorites", "trash", "album"
  albumId,
  onPhotoClick,
  onPhotosUpdated,
  refreshTrigger, // parent trigger to force refresh
}) {
  const [photos, setPhotos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(160); // minmax(zoomLevel px)
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);

  useEffect(() => {
    fetchPhotosList();
  }, [currentView, albumId, ratingFilter, searchQuery, refreshTrigger]);

  // Set up scan progress event listener from Tauri
  useEffect(() => {
    let unlisten = null;
    async function setupListener() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("scan-progress", (event) => {
        setScanProgress(event.payload);
      });
    }
    setupListener();
    return () => {
      if (unlisten) unlisten.then((f) => f());
    };
  }, []);

  const fetchPhotosList = async () => {
    try {
      const list = await invoke("get_photos", {
        search: searchQuery || null,
        favoriteOnly: currentView === "favorites",
        deletedOnly: currentView === "trash",
        albumId: albumId || null,
        ratingFilter: ratingFilter > 0 ? ratingFilter : null,
      });
      setPhotos(list);
    } catch (e) {
      console.error("Failed to load photos", e);
    }
  };

  const handleScanWorkspace = async () => {
    setScanning(true);
    setScanProgress({ scanned: 0, total: 0, current_file: "准备中..." });
    try {
      const added = await invoke("scan_workspace");
      alert(`相册扫描完成！新增了 ${added} 张照片`);
      fetchPhotosList();
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      alert("扫描失败: " + e);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const handleToggleFav = async (id, isFav, e) => {
    e.stopPropagation();
    try {
      await invoke("toggle_favorite", { id, isFavorite: !isFav });
      fetchPhotosList();
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  // Group photos by date taken (YYYY-MM-DD)
  const groupPhotosByDate = () => {
    const groups = {};
    photos.forEach((photo) => {
      const dateStr = photo.date_taken ? photo.date_taken.split(" ")[0] : "未知日期";
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(photo);
    });
    // Sort dates descending
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        items: groups[date],
      }));
  };

  const groupedPhotos = groupPhotosByDate();

  return (
    <div className="timeline-viewport">
      <div className="timeline-toolbar">
        {/* Search */}
        <div className="search-bar-container">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件名、相机、参数..."
          />
        </div>

        {/* Rating Filter */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>星级筛选:</span>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value))}
            className="text-input"
            style={{ width: "90px", padding: "6px", fontSize: "12px" }}
          >
            <option value="0">全部</option>
            <option value="1">1星及以上</option>
            <option value="3">3星及以上</option>
            <option value="5">5星专属</option>
          </select>
        </div>

        {/* Zoom Slider */}
        <div className="zoom-slider-container">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <input
            type="range"
            min="80"
            max="300"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="zoom-slider"
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </div>

        {/* Scan Button */}
        {currentView === "photos" && (
          <button
            onClick={handleScanWorkspace}
            disabled={scanning}
            className="gradient-btn"
            style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            {scanning ? "扫描中..." : "同步磁盘相册"}
          </button>
        )}
      </div>

      {scanning && scanProgress && (
        <div className="glass-panel" style={{ padding: "16px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "10px", background: "rgba(59, 130, 246, 0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span>🔍 正在扫描工作空间照片文件...</span>
            <span style={{ fontWeight: 600 }}>{scanProgress.scanned} / {scanProgress.total}</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-bar"
              style={{ width: `${scanProgress.total > 0 ? (scanProgress.scanned / scanProgress.total) * 100 : 0}%` }}
            />
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-dark)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            当前: {scanProgress.current_file}
          </span>
        </div>
      )}

      {photos.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "var(--text-muted)", gap: "12px" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span style={{ fontSize: "15px" }}>相册空空如也</span>
          {currentView === "photos" && (
            <button onClick={handleScanWorkspace} className="text-input" style={{ width: "auto", padding: "6px 12px", border: "1px solid var(--border-color)", cursor: "pointer", background: "rgba(255,255,255,0.03)" }}>
              立即同步扫描此文件夹
            </button>
          )}
        </div>
      ) : (
        groupedPhotos.map((group) => (
          <div key={group.date} className="date-group">
            <div className="date-group-header">
              <span>{group.date}</span>
              <span className="date-group-count">{group.items.length} 张照片</span>
            </div>
            <div
              className="photo-grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoomLevel}px, 1fr))` }}
            >
              {group.items.map((photo, index) => (
                <div
                  key={photo.id}
                  className="photo-card"
                  onClick={() => onPhotoClick(photos, photos.findIndex(p => p.id === photo.id))}
                >
                  <ThumbnailImage id={photo.id} alt={photo.filename} />
                  
                  {/* File Type Badge (e.g. RAW / CR2 / ARW) */}
                  {photo.file_type !== "JPG" && photo.file_type !== "JPEG" && (
                    <div className="photo-card-badge">{photo.file_type}</div>
                  )}

                  <div className="photo-card-overlay">
                    <div className="photo-card-actions">
                      <button
                        className={`photo-action-btn ${photo.is_favorite ? "active-fav" : ""}`}
                        onClick={(e) => handleToggleFav(photo.id, photo.is_favorite, e)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={photo.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                      </button>
                    </div>
                    {photo.rating > 0 && (
                      <span style={{ fontSize: "11px", fontWeight: "600", color: "#FBBF24", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                        ★ {photo.rating}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
