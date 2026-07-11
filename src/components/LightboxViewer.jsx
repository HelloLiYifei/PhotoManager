import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { loadPhotoPreview, prefetchPhotoPreview } from "../lib/previewLoader";

export default function LightboxViewer({
  photosList,
  initialIndex,
  onClose,
  onPhotosUpdated,
  onShowOnMap,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [thumbnailSrc, setThumbnailSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const currentPhoto = photosList[currentIndex];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPreviewSrc(null);
    setThumbnailSrc(null);

    loadPhotoThumbnail(currentPhoto.id)
      .then((url) => {
        if (active) setThumbnailSrc(url);
      })
      .catch(() => {});

    loadPhotoPreview(currentPhoto.id)
      .then((url) => {
        if (active) setPreviewSrc(url);
      })
      .catch((error) => {
        console.error(error);
        if (active) setLoading(false);
      });

    // Warm both navigation directions. The browser keeps encoded bytes and
    // decoded surfaces in its native image cache, making the next switch fast.
    prefetchPhotoPreview(photosList[currentIndex - 1]?.id);
    prefetchPhotoPreview(photosList[currentIndex + 1]?.id);

    return () => {
      active = false;
    };
  }, [currentIndex, currentPhoto?.id, photosList]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, photosList.length]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < photosList.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleToggleFav = async () => {
    if (!currentPhoto) return;
    try {
      const nextFav = !currentPhoto.is_favorite;
      await invoke("toggle_favorite", { id: currentPhoto.id, isFavorite: nextFav });
      
      // Update local state
      currentPhoto.is_favorite = nextFav;
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRatingChange = async (rating) => {
    if (!currentPhoto) return;
    try {
      await invoke("update_rating", { id: currentPhoto.id, rating });
      // Update local state
      currentPhoto.rating = rating;
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (!currentPhoto) return;
    const isTrash = currentPhoto.is_deleted;
    try {
      await invoke("delete_photo", { id: currentPhoto.id, isDeleted: !isTrash });
      alert(isTrash ? "照片已恢复" : "照片已移动到回收站");
      
      // Remove from list or trigger refresh
      if (onPhotosUpdated) onPhotosUpdated();
      
      // Move to next photo or close if none left
      if (photosList.length <= 1) {
        onClose();
      } else {
        handleNext();
      }
    } catch (e) {
      alert("操作失败: " + e);
    }
  };

  const handlePermanentDelete = async () => {
    if (!currentPhoto) return;
    if (!confirm("此操作将永久从磁盘删除照片文件，且不可恢复！确定吗？")) {
      return;
    }
    try {
      await invoke("permanently_delete_photo", { id: currentPhoto.id });
      alert("照片已永久删除");
      if (onPhotosUpdated) onPhotosUpdated();
      
      if (photosList.length <= 1) {
        onClose();
      } else {
        handleNext();
      }
    } catch (e) {
      alert("删除失败: " + e);
    }
  };

  if (!currentPhoto) return null;

  return (
    <div className="lightbox-overlay">
      {/* Main Image View */}
      <div className="lightbox-main">
        <button className="lightbox-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {currentIndex > 0 && (
          <button className="lightbox-nav prev" onClick={handlePrev}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        )}

        <div className="lightbox-image-container">
          {thumbnailSrc && (
            <img
              key={`thumbnail-${currentPhoto.id}`}
              src={thumbnailSrc}
              alt=""
              className={`lightbox-image lightbox-thumbnail ${loading ? "visible" : ""}`}
            />
          )}
          {loading && !thumbnailSrc && (
            <div className="lightbox-loading" style={{ color: "var(--text-muted)", fontSize: "14px", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
              <div className="photo-card-img" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent-color)", animation: "spin 1s linear infinite" }} />
              正在打开大图...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {previewSrc && (
            <img
              key={`preview-${currentPhoto.id}`}
              src={previewSrc}
              alt={currentPhoto.filename}
              className={`lightbox-image lightbox-full-image ${loading ? "loading" : "loaded"}`}
              decoding="async"
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          )}
        </div>

        {currentIndex < photosList.length - 1 && (
          <button className="lightbox-nav next" onClick={handleNext}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}
      </div>

      {/* Info Sidebar */}
      <div className="lightbox-sidebar">
        {/* Actions Section */}
        <div className="sidebar-section">
          <span className="section-hdr">快捷操作</span>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {/* Fav */}
            <button
              onClick={handleToggleFav}
              className="gradient-btn"
              style={{
                background: currentPhoto.is_favorite ? "#EF4444" : "rgba(255,255,255,0.05)",
                border: currentPhoto.is_favorite ? "none" : "1px solid var(--border-color)",
                padding: "8px 12px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={currentPhoto.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              {currentPhoto.is_favorite ? "已喜欢" : "标记喜欢"}
            </button>

            {/* Trash/Delete */}
            <button
              onClick={handleDelete}
              className="text-input"
              style={{
                width: "auto",
                borderColor: currentPhoto.is_deleted ? "var(--success-color)" : "var(--danger-color)",
                color: currentPhoto.is_deleted ? "var(--success-color)" : "var(--danger-color)",
                background: "rgba(0,0,0,0.2)",
                padding: "8px 12px",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              {currentPhoto.is_deleted ? "恢复照片" : "移入回收站"}
            </button>
          </div>

          {currentPhoto.is_deleted && (
            <button
              onClick={handlePermanentDelete}
              className="gradient-btn"
              style={{ background: "linear-gradient(135deg, #EF4444, #991B1B)", padding: "10px", borderRadius: "8px", fontSize: "13px" }}
            >
              💥 彻底永久删除 (不可恢复)
            </button>
          )}
        </div>

        {/* Rating */}
        <div className="sidebar-section">
          <span className="section-hdr">标记星级</span>
          <div className="star-rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`star-icon ${star <= currentPhoto.rating ? "active" : ""}`}
                onClick={() => handleRatingChange(star)}
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={star <= currentPhoto.rating ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            ))}
          </div>
        </div>

        {/* EXIF Information */}
        <div className="sidebar-section">
          <span className="section-hdr">拍摄信息 (EXIF)</span>
          <div className="exif-grid">
            <div className="exif-item">
              <span className="exif-label">📸 相机品牌</span>
              <span className="exif-val">{currentPhoto.camera_make || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">🎥 相机型号</span>
              <span className="exif-val">{currentPhoto.camera_model || "—"}</span>
            </div>
            <div className="exif-item" style={{ gridColumn: "span 2" }}>
              <span className="exif-label">👓 镜头型号</span>
              <span className="exif-val">{currentPhoto.lens_model || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">⏱️ 快门速度</span>
              <span className="exif-val">{currentPhoto.exposure_time || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">🔘 光圈数值</span>
              <span className="exif-val">{currentPhoto.f_number ? `f/${currentPhoto.f_number}` : "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">⚡ 感光度 (ISO)</span>
              <span className="exif-val">{currentPhoto.iso || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">📏 焦距</span>
              <span className="exif-val">{currentPhoto.focal_length ? `${currentPhoto.focal_length} mm` : "—"}</span>
            </div>
          </div>
        </div>

        {Number.isFinite(currentPhoto.latitude) && Number.isFinite(currentPhoto.longitude) && (
          <div className="sidebar-section">
            <span className="section-hdr">拍摄位置</span>
            <button
              type="button"
              className="photo-location-button"
              onClick={() => onShowOnMap?.(currentPhoto)}
            >
              <span className="photo-location-pin" aria-hidden="true">⌖</span>
              <span>
                <strong>在地图中查看</strong>
                <small>{currentPhoto.latitude.toFixed(5)}, {currentPhoto.longitude.toFixed(5)}</small>
              </span>
              <span className="photo-location-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {/* File Information */}
        <div className="sidebar-section">
          <span className="section-hdr">文件元数据</span>
          <div className="exif-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="exif-item">
              <span className="exif-label">文件名</span>
              <span className="exif-val" style={{ wordBreak: "break-all" }}>{currentPhoto.filename}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">路径</span>
              <span className="exif-val" style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all" }}>
                {currentPhoto.path}
              </span>
            </div>
            <div className="exif-item">
              <span className="exif-label">文件大小</span>
              <span className="exif-val">{(currentPhoto.file_size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">图片尺寸</span>
              <span className="exif-val">
                {currentPhoto.width && currentPhoto.height ? `${currentPhoto.width} × ${currentPhoto.height}` : "—"}
              </span>
            </div>
            <div className="exif-item">
              <span className="exif-label">拍摄时间</span>
              <span className="exif-val">{currentPhoto.date_taken || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
