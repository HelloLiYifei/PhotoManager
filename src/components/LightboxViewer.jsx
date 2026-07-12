import { useState, useEffect, useRef } from "react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { loadPhotoPreview, prefetchPhotoPreview } from "../lib/previewLoader";
import {
  addTagToPhoto,
  deletePhoto,
  getPhotoTags,
  permanentlyDeletePhoto,
  removeTagFromPhoto,
  toggleFavorite,
  updateRating,
} from "../services/photoService";

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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [photoTags, setPhotoTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagEditor, setShowTagEditor] = useState(false);
  const dragStateRef = useRef(null);
  
  const currentPhoto = photosList[currentIndex];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPreviewSrc(null);
    setThumbnailSrc(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);

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

  useEffect(() => {
    let active = true;
    setPhotoTags([]);
    setTagInput("");
    setShowTagEditor(false);
    getPhotoTags({ photoId: currentPhoto.id })
      .then((tags) => {
        if (active) setPhotoTags(tags);
      })
      .catch(console.error);
    return () => { active = false; };
  }, [currentPhoto?.id]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isTyping) {
        if (e.key === "Escape") {
          setShowTagEditor(false);
          e.target.blur();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "Escape") {
        if (showTagEditor) setShowTagEditor(false);
        else onClose();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        changeZoom(0.25);
      } else if (e.key === "-") {
        e.preventDefault();
        changeZoom(-0.25);
      } else if (e.key === "0") {
        e.preventDefault();
        resetTransform();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, photosList.length, showTagEditor]);

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

  const clampZoom = (value) => Math.min(8, Math.max(0.25, value));

  const setZoomLevel = (nextValue) => {
    setZoom((current) => {
      const next = clampZoom(typeof nextValue === "function" ? nextValue(current) : nextValue);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const changeZoom = (delta) => {
    setZoomLevel((current) => Math.round((current + delta) * 100) / 100);
  };

  const resetTransform = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragStateRef.current = null;
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomLevel((current) => current * factor);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current) return;
    setPan({
      x: dragStateRef.current.originX + event.clientX - dragStateRef.current.startX,
      y: dragStateRef.current.originY + event.clientY - dragStateRef.current.startY,
    });
  };

  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom === 1) {
      setZoomLevel(2);
    } else {
      resetTransform();
    }
  };

  const imageTransform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;

  const handleToggleFav = async () => {
    if (!currentPhoto) return;
    try {
      const nextFav = !currentPhoto.isFavorite;
      await toggleFavorite({ id: currentPhoto.id, isFavorite: nextFav });
      
      // Update local state
      currentPhoto.isFavorite = nextFav;
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRatingChange = async (rating) => {
    if (!currentPhoto) return;
    try {
      await updateRating({ id: currentPhoto.id, rating });
      // Update local state
      currentPhoto.rating = rating;
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTag = async (event) => {
    event.preventDefault();
    const tagName = tagInput.trim();
    if (!tagName || !currentPhoto || photoTags.includes(tagName)) return;
    try {
      await addTagToPhoto({ photoId: currentPhoto.id, tagName });
      setPhotoTags((current) => [...current, tagName]);
      setTagInput("");
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoveTag = async (tagName) => {
    if (!currentPhoto) return;
    try {
      await removeTagFromPhoto({ photoId: currentPhoto.id, tagName });
      setPhotoTags((current) => current.filter((tag) => tag !== tagName));
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async () => {
    if (!currentPhoto) return;
    const isTrash = currentPhoto.isDeleted;
    try {
      await deletePhoto({ id: currentPhoto.id, isDeleted: !isTrash });
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
      await permanentlyDeletePhoto({ id: currentPhoto.id });
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

        <button
          type="button"
          className="lightbox-sidebar-toggle"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? "展开信息栏" : "折叠信息栏"}
          aria-label={sidebarCollapsed ? "展开信息栏" : "折叠信息栏"}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? "‹" : "›"}
        </button>

        {currentIndex > 0 && (
          <button className="lightbox-nav prev" onClick={handlePrev}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        )}

        <div
          className={`lightbox-image-container ${zoom > 1 ? "is-zoomed" : ""} ${isDragging ? "is-dragging" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {thumbnailSrc && (
            <img
              key={`thumbnail-${currentPhoto.id}`}
              src={thumbnailSrc}
              alt=""
              className={`lightbox-image lightbox-thumbnail ${loading ? "visible" : ""}`}
              style={{ transform: imageTransform }}
              draggable={false}
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
              style={{ transform: imageTransform }}
              draggable={false}
              decoding="async"
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          )}
        </div>

        <div className="lightbox-zoom-toolbar" role="toolbar" aria-label="图片浏览快捷操作">
          <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 0.25} title="缩小 (-)">−</button>
          <button type="button" className="zoom-value" onClick={resetTransform} title="恢复适合窗口 (0)">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 8} title="放大 (+)">＋</button>
          <span className="zoom-divider" />
          <button type="button" onClick={resetTransform} disabled={zoom === 1 && pan.x === 0 && pan.y === 0} title="复位图片">
            适合窗口
          </button>
          <span className="zoom-divider" />
          <div className="lightbox-bottom-rating" role="group" aria-label="标记星级">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={star <= currentPhoto.rating ? "active" : ""}
                onClick={() => handleRatingChange(star)}
                title={`${star} 星`}
                aria-label={`${star} 星`}
              >
                ★
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`lightbox-bottom-action ${showTagEditor ? "is-active" : ""}`}
            onClick={() => setShowTagEditor((current) => !current)}
            title="编辑标签"
          >
            ⌑ 标签{photoTags.length > 0 ? ` (${photoTags.length})` : ""}
          </button>
          <button
            type="button"
            onClick={handleToggleFav}
            className={`lightbox-bottom-action ${currentPhoto.isFavorite ? "is-favorite" : ""}`}
            title={currentPhoto.isFavorite ? "取消喜欢" : "标记喜欢"}
          >
            {currentPhoto.isFavorite ? "♥ 已喜欢" : "♡ 喜欢"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={`lightbox-bottom-action ${currentPhoto.isDeleted ? "is-restore" : "is-danger"}`}
            title={currentPhoto.isDeleted ? "恢复照片" : "移入回收站"}
          >
            {currentPhoto.isDeleted ? "↩ 恢复" : "⌫ 回收站"}
          </button>
          {currentPhoto.isDeleted && (
            <button
              type="button"
              onClick={handlePermanentDelete}
              className="lightbox-bottom-action is-danger is-permanent"
              title="永久删除照片"
            >
              永久删除
            </button>
          )}
          {showTagEditor && (
            <div className="lightbox-tag-editor">
              <strong>照片标签</strong>
              <div className="lightbox-tag-list">
                {photoTags.length === 0 ? (
                  <span className="lightbox-tag-empty">暂无标签</span>
                ) : photoTags.map((tag) => (
                  <span className="lightbox-tag-chip" key={tag}>
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={`移除标签 ${tag}`}>×</button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="输入新标签"
                  autoFocus
                />
                <button type="submit" disabled={!tagInput.trim()}>添加</button>
              </form>
            </div>
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
      {!sidebarCollapsed && <div className="lightbox-sidebar">
        {/* EXIF Information */}
        <div className="sidebar-section">
          <span className="section-hdr">拍摄信息 (EXIF)</span>
          <div className="exif-grid">
            <div className="exif-item">
              <span className="exif-label">📸 相机品牌</span>
              <span className="exif-val">{currentPhoto.cameraMake || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">🎥 相机型号</span>
              <span className="exif-val">{currentPhoto.cameraModel || "—"}</span>
            </div>
            <div className="exif-item" style={{ gridColumn: "span 2" }}>
              <span className="exif-label">👓 镜头型号</span>
              <span className="exif-val">{currentPhoto.lensModel || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">⏱️ 快门速度</span>
              <span className="exif-val">{currentPhoto.exposureTime || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">🔘 光圈数值</span>
              <span className="exif-val">{currentPhoto.fNumber ? `f/${currentPhoto.fNumber}` : "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">⚡ 感光度 (ISO)</span>
              <span className="exif-val">{currentPhoto.iso || "—"}</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">📏 焦距</span>
              <span className="exif-val">{currentPhoto.focalLength ? `${currentPhoto.focalLength} mm` : "—"}</span>
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
              <span className="exif-val">{(currentPhoto.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
            <div className="exif-item">
              <span className="exif-label">图片尺寸</span>
              <span className="exif-val">
                {currentPhoto.width && currentPhoto.height ? `${currentPhoto.width} × ${currentPhoto.height}` : "—"}
              </span>
            </div>
            <div className="exif-item">
              <span className="exif-label">拍摄时间</span>
              <span className="exif-val">{currentPhoto.dateTaken || "—"}</span>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
