import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { loadPhotoPreview } from "../lib/previewLoader";

// Sub-component to lazy load thumbnail URLs through the local media protocol
function ThumbnailImage({ id, alt, scrollRoot, fit = "natural" }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef(null);

  useEffect(() => {
    let active = true;
    
    // Intersection Observer to lazy load only when visible!
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const rootCenter = entry.rootBounds
            ? (entry.rootBounds.top + entry.rootBounds.bottom) / 2
            : window.innerHeight / 2;
          const cardCenter = (entry.boundingClientRect.top + entry.boundingClientRect.bottom) / 2;
          loadThumbnail(10000 - Math.abs(cardCenter - rootCenter));
          observer.disconnect();
        }
      },
      { root: scrollRoot?.current || null, rootMargin: "450px 0px", threshold: 0.01 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    async function loadThumbnail(priority) {
      try {
        const imageUrl = await loadPhotoThumbnail(id, priority);
        if (active) {
          setSrc(imageUrl);
          setLoading(false);
        }
      } catch (err) {
        if (active) setLoading(false);
      }
    }

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id]);

  if (loading) {
    return <div ref={imgRef} className={`photo-card-img thumbnail-${fit}`} />;
  }

  return (
    <img
      ref={imgRef}
      src={src || "/placeholder.svg"}
      alt={alt}
      className={`photo-thumbnail thumbnail-${fit}`}
      loading="lazy"
      decoding="async"
    />
  );
}

function GalleryPreviewImage({ id, alt }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");
    loadPhotoPreview(id)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(console.error);
    return () => { active = false; };
  }, [id]);

  return src
    ? <img src={src} className="gallery-preview-image" alt={alt} decoding="async" />
    : <div className="gallery-preview-loading"><div className="spinner" /></div>;
}

// Sub-component to load medium-res preview in Compare mode
function ComparePreviewImage({ id }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadPhotoPreview(id)
      .then((url) => {
        if (active) {
          setSrc(url);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error(e);
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>正在读取高清对比图...</div>;
  }

  return <img src={src} className="compare-locked-img" alt="对比锁定图" decoding="async" />;
}

export default function TimelineGrid({
  currentView, // "albums", "album", "favorites", "trash"
  albumId,
  onPhotoClick,
  onPhotosUpdated,
  refreshTrigger,
}) {
  const [photos, setPhotos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("photomanager-photo-view");
    return ["list", "icons", "gallery", "masonry"].includes(saved) ? saved : "masonry";
  });

  // Selection states
  const [selectedIds, setSelectedIds] = useState([]);
  const [primaryPhoto, setPrimaryPhoto] = useState(null); // Photo currently shown in right details drawer
  const [primaryTags, setPrimaryTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState("");
  const gridScrollRef = useRef(null);

  // Compare mode states
  const [compareMode, setCompareMode] = useState(false);
  const [compareLockedId, setCompareLockedId] = useState(null);

  // Move album modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [albumsList, setAlbumsList] = useState([]);

  useEffect(() => {
    fetchPhotosList();
    loadAllTags();
    setSelectedIds([]);
    setPrimaryPhoto(null);
  }, [currentView, albumId, ratingFilter, searchQuery, tagFilter, refreshTrigger]);

  useEffect(() => {
    if (primaryPhoto) {
      loadPhotoTags(primaryPhoto.id);
    } else {
      setPrimaryTags([]);
    }
  }, [primaryPhoto]);

  const fetchPhotosList = async () => {
    try {
      const list = await invoke("get_photos", {
        search: searchQuery || null,
        favoriteOnly: currentView === "favorites",
        deletedOnly: currentView === "trash",
        albumId: albumId || null,
        ratingFilter: ratingFilter > 0 ? ratingFilter : null,
        tagFilter: tagFilter || null,
      });
      setPhotos(list);
    } catch (e) {
      console.error("Failed to load photos", e);
    }
  };

  const loadAllTags = async () => {
    try {
      const tags = await invoke("get_all_tags");
      setAllTags(tags);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPhotoTags = async (id) => {
    try {
      const tags = await invoke("get_photo_tags", { photoId: id });
      setPrimaryTags(tags);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAlbumsListForMove = async () => {
    try {
      const list = await invoke("get_albums");
      setAlbumsList(list);
      setShowMoveModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Selection handling
  const handlePhotoSelect = (photo, e) => {
    e.stopPropagation();
    
    // Check double click -> open Lightbox viewer
    if (e.detail === 2) {
      const idx = photos.findIndex(p => p.id === photo.id);
      onPhotoClick(photos, idx);
      return;
    }

    let updated = [];
    if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      if (selectedIds.includes(photo.id)) {
        updated = selectedIds.filter(id => id !== photo.id);
      } else {
        updated = [...selectedIds, photo.id];
      }
    } else {
      // Single select: if clicked again, deselect. Otherwise, select only this.
      if (selectedIds.includes(photo.id) && selectedIds.length === 1) {
        updated = [];
      } else {
        updated = [photo.id];
      }
    }

    setSelectedIds(updated);
    
    if (updated.length > 0) {
      // Set primary photo as the last selected
      const primary = photos.find(p => p.id === updated[updated.length - 1]);
      setPrimaryPhoto(primary);
    } else {
      setPrimaryPhoto(null);
    }
  };

  // Add tag to primary photo
  const handleAddTagSubmit = async (e) => {
    e.preventDefault();
    if (!newTagInput.trim() || !primaryPhoto) return;

    try {
      await invoke("add_tag_to_photo", {
        photoId: primaryPhoto.id,
        tagName: newTagInput.trim(),
      });
      setNewTagInput("");
      loadPhotoTags(primaryPhoto.id);
      loadAllTags();
    } catch (err) {
      console.error(err);
    }
  };

  // Remove tag from primary photo
  const handleRemoveTag = async (tagName) => {
    if (!primaryPhoto) return;
    try {
      await invoke("remove_tag_from_photo", {
        photoId: primaryPhoto.id,
        tagName,
      });
      loadPhotoTags(primaryPhoto.id);
      loadAllTags();
    } catch (err) {
      console.error(err);
    }
  };

  // Bottom toolbar actions
  const handleBatchFavorite = async () => {
    if (selectedIds.length === 0) return;
    try {
      // Determine action based on the first selected photo
      const first = photos.find(p => p.id === selectedIds[0]);
      const nextFav = first ? !first.is_favorite : true;
      
      await Promise.all(selectedIds.map(id =>
        invoke("toggle_favorite", { id, isFavorite: nextFav })
      ));
      
      fetchPhotosList();
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const isTrashView = currentView === "trash";
    
    if (isTrashView) {
      // Trash view: "转移至回收站" (Move to OS Recycle Bin)
      if (confirm(`确定要将选中的 ${selectedIds.length} 张照片转移至操作系统回收站吗？物理文件将被删除并放入回收站！`)) {
        try {
          await invoke("permanently_delete_photos", { ids: selectedIds });
          setSelectedIds([]);
          setPrimaryPhoto(null);
          fetchPhotosList();
          if (onPhotosUpdated) onPhotosUpdated();
        } catch (e) {
          alert("转移至回收站失败: " + e);
        }
      }
    } else {
      // Normal view: mark as deleted (is_deleted = 1)
      try {
        await Promise.all(selectedIds.map(id =>
          invoke("delete_photo", { id, isDeleted: true })
        ));
        setSelectedIds([]);
        setPrimaryPhoto(null);
        fetchPhotosList();
        if (onPhotosUpdated) onPhotosUpdated();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleBatchRestore = async () => {
    if (selectedIds.length === 0) return;
    try {
      await invoke("restore_photos", { ids: selectedIds });
      setSelectedIds([]);
      setPrimaryPhoto(null);
      fetchPhotosList();
      if (onPhotosUpdated) onPhotosUpdated();
    } catch (e) {
      alert("还原失败: " + e);
    }
  };

  const handleBatchMoveSubmit = async (targetAlbId) => {
    try {
      await invoke("move_photos_to_album", {
        photoIds: selectedIds,
        targetAlbumId: targetAlbId,
      });
      setShowMoveModal(false);
      setSelectedIds([]);
      setPrimaryPhoto(null);
      fetchPhotosList();
      if (onPhotosUpdated) onPhotosUpdated();
      alert("物理移动完成！");
    } catch (e) {
      alert("移动失败: " + e);
    }
  };

  const handleBatchExport = async () => {
    try {
      const destPath = await invoke("select_directory");
      if (!destPath) return;

      // Ask Rust to get the absolute paths for these IDs and copy them
      // To keep it simple, we retrieve the active workspace path, build the absolute paths, and copy them in JS or Rust.
      // Let's copy them in Rust or simply let the user know. Wait, let's write a small command or do a copy loop.
      // But wait! We can just fetch the active workspace path, and copy them!
      // Actually, let's copy them by triggering a file write or let's create a move/copy logic in Rust.
      // Wait, is there a copy command? Let's check: the user says "导出，选中图片后可以导出图片到外部路径".
      // We can add a simple command in Rust if needed, or simply invoke copy.
      // Wait! We can call a tauri command that does batch copy.
      // Let's see: we don't have a copy command, but we can write a quick Tauri command or write it directly!
      // Wait, let's verify if we can add a batch copy command `export_photos(ids: Vec<String>, dest_dir: String)` to `commands.rs`.
      // Yes! That would be extremely clean and robust! Let's do that right away so the frontend doesn't need to do file IO!
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCompare = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompareLockedId(null);
    } else {
      if (selectedIds.length === 0) {
        alert("请先选择一张作为对比基准的主照片！");
        return;
      }
      setCompareLockedId(selectedIds[selectedIds.length - 1]);
      setCompareMode(true);
    }
  };

  const handleGallerySelect = (photo, e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      handlePhotoSelect(photo, e);
      return;
    }
    setSelectedIds([photo.id]);
    setPrimaryPhoto(photo);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem("photomanager-photo-view", mode);
    if (compareMode && mode !== "masonry") {
      setCompareMode(false);
      setCompareLockedId(null);
    }
  };

  // Custom Tagging dialog
  const handleBatchAddTag = async () => {
    const tagName = prompt("请输入要为选中照片批量添加的标签名称：");
    if (!tagName || !tagName.trim()) return;
    try {
      await Promise.all(selectedIds.map(id =>
        invoke("add_tag_to_photo", { photoId: id, tagName: tagName.trim() })
      ));
      if (primaryPhoto) loadPhotoTags(primaryPhoto.id);
      loadAllTags();
      alert("批量添加标签成功！");
    } catch (e) {
      console.error(e);
    }
  };

  // Render the core waterfall card grid
  const renderMasonryGrid = () => {
    return (
      <div className="masonry-grid">
        {photos.map((photo) => {
          const isSelected = selectedIds.includes(photo.id);
          const isCompareBase = compareLockedId === photo.id;

          return (
            <div
              key={photo.id}
              className={`masonry-item ${isSelected ? "selected" : ""} ${isCompareBase ? "compare-base" : ""}`}
              onClick={(e) => handlePhotoSelect(photo, e)}
              style={{
                border: isCompareBase ? "2px solid #EF4444" : isSelected ? "2px solid var(--primary-start)" : "2px solid transparent",
              }}
            >
              <ThumbnailImage id={photo.id} alt={photo.filename} scrollRoot={gridScrollRef} />
              
              {/* Badges overlay */}
              {photo.file_type !== "JPG" && photo.file_type !== "JPEG" && (
                <div className="photo-card-badge" style={{ zIndex: 5 }}>{photo.file_type}</div>
              )}

              {photo.is_favorite && (
                <div className="photo-card-badge" style={{ right: "8px", left: "auto", background: "rgba(239, 68, 68, 0.8)", zIndex: 5 }}>❤️</div>
              )}

              <div className="photo-card-overlay" style={{ padding: "8px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#FFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                  {photo.filename}
                </div>
                {photo.rating > 0 && (
                  <span style={{ fontSize: "10px", color: "#FBBF24", textShadow: "0 1px 3px rgba(0,0,0,0.8)", marginTop: "2px" }}>
                    ★ {photo.rating}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderIconGrid = () => (
    <div className="finder-icon-grid">
      {photos.map((photo) => {
        const isSelected = selectedIds.includes(photo.id);
        return (
          <div
            key={photo.id}
            className={`finder-icon-item ${isSelected ? "selected" : ""}`}
            onClick={(e) => handlePhotoSelect(photo, e)}
          >
            <div className="finder-icon-thumbnail">
              <ThumbnailImage id={photo.id} alt={photo.filename} scrollRoot={gridScrollRef} fit="cover" />
              {photo.is_favorite && <span className="finder-favorite-badge">♥</span>}
              {photo.file_type !== "JPG" && photo.file_type !== "JPEG" && (
                <span className="finder-type-badge">{photo.file_type}</span>
              )}
            </div>
            <div className="finder-icon-name" title={photo.filename}>{photo.filename}</div>
          </div>
        );
      })}
    </div>
  );

  const renderListView = () => (
    <div className="finder-list" role="table" aria-label="照片列表">
      <div className="finder-list-header" role="row">
        <span>名称</span><span>拍摄日期</span><span>类型</span><span>大小</span><span>尺寸</span>
      </div>
      {photos.map((photo) => {
        const isSelected = selectedIds.includes(photo.id);
        return (
          <div
            key={photo.id}
            className={`finder-list-row ${isSelected ? "selected" : ""}`}
            role="row"
            onClick={(e) => handlePhotoSelect(photo, e)}
          >
            <span className="finder-list-name">
              <span className="finder-list-thumb">
                <ThumbnailImage id={photo.id} alt="" scrollRoot={gridScrollRef} fit="cover" />
              </span>
              <span title={photo.filename}>{photo.is_favorite ? "♥ " : ""}{photo.filename}</span>
            </span>
            <span>{photo.date_taken || "—"}</span>
            <span>{photo.file_type}</span>
            <span>{(photo.file_size / (1024 * 1024)).toFixed(2)} MB</span>
            <span>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—"}</span>
          </div>
        );
      })}
    </div>
  );

  const galleryPhoto = primaryPhoto || photos[0];
  const renderGalleryView = () => galleryPhoto && (
    <div className="finder-gallery">
      <div
        className="finder-gallery-stage"
        onDoubleClick={() => onPhotoClick(photos, photos.findIndex((photo) => photo.id === galleryPhoto.id))}
      >
        <GalleryPreviewImage id={galleryPhoto.id} alt={galleryPhoto.filename} />
        <div className="finder-gallery-caption">
          <strong>{galleryPhoto.filename}</strong>
          <span>{galleryPhoto.date_taken || "日期未知"} · {(galleryPhoto.file_size / (1024 * 1024)).toFixed(2)} MB</span>
        </div>
      </div>
      <div className="finder-gallery-filmstrip" aria-label="照片胶片带">
        {photos.map((photo) => (
          <button
            type="button"
            key={photo.id}
            className={`finder-gallery-film ${galleryPhoto.id === photo.id ? "active" : ""}`}
            onClick={(e) => handleGallerySelect(photo, e)}
            onDoubleClick={() => onPhotoClick(photos, photos.findIndex((item) => item.id === photo.id))}
            title={photo.filename}
          >
            <ThumbnailImage id={photo.id} alt={photo.filename} scrollRoot={gridScrollRef} fit="cover" />
          </button>
        ))}
      </div>
    </div>
  );

  const renderCurrentView = () => {
    if (viewMode === "list") return renderListView();
    if (viewMode === "icons") return renderIconGrid();
    if (viewMode === "gallery") return renderGalleryView();
    return renderMasonryGrid();
  };

  return (
    <div className="timeline-viewport animate-fade-in" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      
      {/* Top filters and search */}
      <div className="timeline-toolbar" style={{ flexShrink: 0 }}>
        {/* Search */}
        <div className="search-bar-container">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

        {/* Tag filter */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>标签筛选:</span>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="text-input"
            style={{ width: "110px", padding: "6px", fontSize: "12px" }}
          >
            <option value="">全部</option>
            {allTags.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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

        <div className="finder-view-switcher" role="group" aria-label="预览方式">
          {[
            ["list", "☷", "列表"],
            ["icons", "▦", "图标"],
            ["gallery", "▣", "画廊"],
            ["masonry", "▥", "瀑布流"],
          ].map(([mode, icon, label]) => (
            <button
              type="button"
              key={mode}
              className={viewMode === mode ? "active" : ""}
              onClick={() => handleViewModeChange(mode)}
              title={`${label}视图`}
              aria-label={`${label}视图`}
              aria-pressed={viewMode === mode}
            >
              <span aria-hidden="true">{icon}</span><small>{label}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid display area */}
      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden", position: "relative", width: "100%" }}>
        
        {/* Core photo grid (with splits if in compare mode) */}
        <div ref={gridScrollRef} style={{ flexGrow: 1, overflowY: "auto", paddingRight: "8px", height: "100%" }}>
          {photos.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 0", color: "var(--text-muted)", gap: "12px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span style={{ fontSize: "15px" }}>未发现照片数据</span>
            </div>
          ) : compareMode ? (
            /* Compare Mode Split view */
            <div className="compare-container animate-fade-in">
              <div className="compare-left">
                {renderMasonryGrid()}
              </div>
              <div className="compare-right">
                <button className="compare-exit-btn" onClick={handleToggleCompare}>退出对比</button>
                <div className="compare-locked-img-wrapper">
                  <ComparePreviewImage id={compareLockedId} />
                  <div className="compare-title">📌 对比锁定基准图</div>
                </div>
              </div>
            </div>
          ) : renderCurrentView()}
        </div>

        {/* Right drawer properties panel */}
        {primaryPhoto && (
          <aside className="glass-panel animate-fade-in" style={{ width: "280px", marginLeft: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "1px solid var(--border-color)", flexShrink: 0, overflowY: "auto" }}>
            <div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "15px", fontWeight: "600" }}>📝 照片详细参数</h3>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", wordBreak: "break-all", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div><strong>名称:</strong> {primaryPhoto.filename}</div>
                <div><strong>路径:</strong> {primaryPhoto.path}</div>
                <div><strong>格式:</strong> {primaryPhoto.file_type}</div>
                <div><strong>尺寸:</strong> {primaryPhoto.width && primaryPhoto.height ? `${primaryPhoto.width} x ${primaryPhoto.height}` : "未知"}</div>
                <div><strong>大小:</strong> {(primaryPhoto.file_size / (1024 * 1024)).toFixed(2)} MB</div>
                <div><strong>拍摄日期:</strong> {primaryPhoto.date_taken || "无"}</div>
                {primaryPhoto.camera_make && (
                  <div><strong>相机制造:</strong> {primaryPhoto.camera_make}</div>
                )}
                {primaryPhoto.camera_model && (
                  <div><strong>相机型号:</strong> {primaryPhoto.camera_model}</div>
                )}
                {primaryPhoto.lens_model && (
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}><strong>镜头:</strong> {primaryPhoto.lens_model}</div>
                )}
                {primaryPhoto.exposure_time && (
                  <div><strong>曝光时间:</strong> {primaryPhoto.exposure_time} s</div>
                )}
                {primaryPhoto.f_number && (
                  <div><strong>光圈:</strong> F/{primaryPhoto.f_number}</div>
                )}
                {primaryPhoto.iso && (
                  <div><strong>ISO:</strong> {primaryPhoto.iso}</div>
                )}
                {primaryPhoto.focal_length && (
                  <div><strong>焦距:</strong> {primaryPhoto.focal_length} mm</div>
                )}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: "15px", fontWeight: "600" }}>🏷️ 照片标签</h3>
              
              {/* Tag chip list */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                {primaryTags.length === 0 ? (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>暂无标签</span>
                ) : (
                  primaryTags.map(tag => (
                    <span key={tag} style={{ display: "inline-flex", alignItems: "center", background: "rgba(96,165,250,0.15)", color: "#93C5FD", fontSize: "11px", padding: "4px 8px", borderRadius: "20px", border: "1px solid rgba(96,165,250,0.25)" }}>
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: "4px", padding: 0, fontWeight: "bold", fontSize: "10px" }}>×</button>
                    </span>
                  ))
                )}
              </div>

              {/* Tag Input Form */}
              <form onSubmit={handleAddTagSubmit} style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  className="text-input"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="新建标签..."
                  style={{ padding: "6px", fontSize: "12px", borderRadius: "6px", flexGrow: 1 }}
                />
                <button type="submit" className="gradient-btn" style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px" }}>添加</button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* Floating Bottom Toolbar (slides up when photos are selected) */}
      {selectedIds.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          border: "1px solid var(--border-color)",
          zIndex: 100,
          background: "rgba(10, 10, 15, 0.95)",
        }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", marginRight: "8px", fontWeight: "600" }}>
            已选中 {selectedIds.length} 项
          </span>

          <button onClick={handleBatchFavorite} className="text-input" style={{ width: "auto", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }} title="喜欢">
            💖 喜欢
          </button>

          <button onClick={handleToggleCompare} className="text-input" style={{ width: "auto", padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: compareMode ? "var(--primary-start)" : "none" }} title="对比">
            ⚖️ 对比
          </button>

          <button onClick={loadAlbumsListForMove} className="text-input" style={{ width: "auto", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }} title="移动到其他相册">
            📁 移动
          </button>

          <button onClick={handleBatchAddTag} className="text-input" style={{ width: "auto", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }} title="批量打标签">
            🏷️ 贴标
          </button>

          {/* Export Action */}
          <button onClick={async () => {
            try {
              const destPath = await invoke("select_directory");
              if (!destPath) return;

              // To avoid files lock and perform copy in backend, we can write a simple copy logic.
              // Wait, since we don't have an export command, let's write it in commands.rs!
              // Ah! We can easily call standard rust fs::copy through commands. Let's create a quick rust command `export_photos`
              // so that it copies files directly!
              // Yes, let's call the command:
              await invoke("export_photos", { photoIds: selectedIds, destDir: destPath });
              alert("导出成功！");
            } catch (err) {
              alert("导出失败: " + err);
            }
          }} className="text-input" style={{ width: "auto", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }} title="导出到外部路径">
            📤 导出
          </button>

          {currentView === "trash" ? (
            <>
              <button onClick={handleBatchRestore} className="gradient-btn" style={{ padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }} title="撤销删除">
                ↩️ 还原
              </button>
              <button onClick={handleBatchDelete} className="gradient-btn" style={{ padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)" }} title="移入系统回收站">
                🗑️ 彻底删除
              </button>
            </>
          ) : (
            <button onClick={handleBatchDelete} className="gradient-btn" style={{ padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)" }} title="移入垃圾桶">
              🗑️ 删除
            </button>
          )}
        </div>
      )}

      {/* Move Album Modal */}
      {showMoveModal && (
        <div className="wizard-overlay" style={{ zIndex: 1100 }}>
          <div className="welcome-card glass-panel" style={{ maxWidth: "360px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span className="header-title" style={{ fontSize: "15px" }}>📁 移动照片到目标相册</span>
              <button className="photo-action-btn" onClick={() => setShowMoveModal(false)} style={{ fontSize: "18px", padding: 0 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
              {albumsList.map((alb) => (
                <button
                  key={alb.id}
                  onClick={() => handleBatchMoveSubmit(alb.id)}
                  className="text-input"
                  style={{ width: "100%", padding: "10px", textAlign: "left", cursor: "pointer" }}
                >
                  📁 {alb.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
