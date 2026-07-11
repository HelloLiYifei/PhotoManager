import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadPathThumbnail } from "../lib/thumbnailLoader";

// Sub-component to lazy load locally cached preview URLs from a storage path
function CardThumbnailImage({ path, isRaw, scrollRoot, fit = "natural" }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("4 / 3");
  const imgRef = useRef(null);

  useEffect(() => {
    let active = true;
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
      // Explorer starts decoding the next screen before it is visible.  Keep
      // that look-ahead bounded by the shared request queue.
      { root: scrollRoot?.current || null, rootMargin: "450px 0px", threshold: 0.01 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    async function loadThumbnail(priority) {
      try {
        const imageUrl = await loadPathThumbnail(path, isRaw, priority);
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
  }, [path, isRaw]);

  return (
    <div
      ref={imgRef}
      className={`import-thumbnail-frame is-${fit}`}
      style={{ aspectRatio: fit === "natural" ? aspectRatio : undefined }}
    >
      {loading ? (
        <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent-color)", animation: "spin 1s linear infinite" }} />
      ) : (
        <img
          src={src || "/placeholder.svg"}
          alt="Preview"
          decoding="async"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (fit === "natural" && naturalWidth > 0 && naturalHeight > 0) {
              setAspectRatio(`${naturalWidth} / ${naturalHeight}`);
            }
          }}
        />
      )}
    </div>
  );
}

// Generate consistent colors for album tags
const getAlbumColor = (name) => {
  if (name === "默认相册") return "#3B82F6"; // blue
  const colors = ["#EF4444", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#6366F1"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function ImportWizard({ onClose, onImportComplete }) {
  const [cards, setCards] = useState([]);
  const [sourcePath, setSourcePath] = useState("");
  
  const [photos, setPhotos] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState([]); // Tracks checkmarked photos
  const [photoAlbums, setPhotoAlbums] = useState({}); // Maps absolute_path -> album_name (color target)
  
  const [albums, setAlbums] = useState([]);
  const [brushAlbum, setBrushAlbum] = useState(null); // Active album coloring brush
  
  const [nameTemplate, setNameTemplate] = useState("{time}_{original}");
  const [backupPath, setBackupPath] = useState("");
  const [attachCurrentLocation, setAttachCurrentLocation] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [scanning, setScanning] = useState(false);
  
  const gridContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [visibleLimit, setVisibleLimit] = useState(64);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("photomanager-import-view");
    return ["list", "icons", "gallery", "masonry"].includes(saved) ? saved : "masonry";
  });
  const [galleryPath, setGalleryPath] = useState(null);
  const [hideImported, setHideImported] = useState(false);
  const [hideColored, setHideColored] = useState(false);
  const importedCount = photos.filter((photo) => photo.already_imported).length;
  const alreadyImportedPaths = new Set(
    photos.filter((photo) => photo.already_imported).map((photo) => photo.absolute_path)
  );
  const selectedImportPaths = selectedPaths.filter((path) => !alreadyImportedPaths.has(path));
  const filteredPhotos = photos.filter((photo) => {
    if (hideImported && photo.already_imported) return false;
    if (hideColored && selectedPaths.includes(photo.absolute_path)) return false;
    return true;
  });

  // New Album Dialog inside Wizard
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");

  const isMouseDownRef = useRef(false);
  const paintedPathsRef = useRef(new Set());

  // Keep the four-column masonry layout responsive with large storage cards:
  // render an initial batch, then extend it while the user approaches the end.
  useEffect(() => {
    const container = gridContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel || visibleLimit >= filteredPhotos.length) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleLimit((previous) => Math.min(filteredPhotos.length, previous + 64));
        }
      },
      { root: container, rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredPhotos.length, visibleLimit]);

  // Load drives and albums on mount
  useEffect(() => {
    detectDrives();
    loadAlbumsList();
  }, []);

  const detectDrives = async () => {
    try {
      const list = await invoke("detect_cards");
      setCards(list);
      if (list.length > 0) {
        handleSelectSource(list[0].path);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAlbumsList = async () => {
    try {
      const list = await invoke("get_albums");
      setAlbums(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectSource = async (path) => {
    setSourcePath(path);
    setScanning(true);
    setPhotos([]);
    setVisibleLimit(64);
    setSelectedPaths([]);
    setPhotoAlbums({});
    setGalleryPath(null);
    try {
      // scan_card takes (state, path)
      const list = await invoke("scan_card", { path });
      setPhotos(list);
      setGalleryPath(list[0]?.absolute_path || null);
      // Auto-checkmark files that are NOT already imported
      const freshPaths = list.filter(p => !p.already_imported).map(p => p.absolute_path);
      setSelectedPaths(freshPaths);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const handleBrowseSourceFolder = async () => {
    try {
      const dir = await invoke("select_directory");
      if (dir) {
        handleSelectSource(dir);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseBackupFolder = async () => {
    try {
      const dir = await invoke("select_directory");
      if (dir) {
        setBackupPath(dir);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAlbumSubmit = async (e) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    try {
      await invoke("create_album", {
        name: newAlbumName.trim(),
        description: newAlbumDesc.trim() || null,
      });
      setNewAlbumName("");
      setNewAlbumDesc("");
      setShowCreateAlbum(false);
      loadAlbumsList();
    } catch (err) {
      alert("创建相册失败: " + err);
    }
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      const message = "当前系统不支持位置服务";
      setLocationStatus("error");
      setLocationError(message);
      return Promise.reject(new Error(message));
    }

    setLocationStatus("locating");
    setLocationError("");

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setCurrentLocation(location);
          setLocationStatus("ready");
          resolve(location);
        },
        (error) => {
          const messages = {
            1: "位置权限被拒绝，请在系统设置中允许 PhotoManager 访问位置",
            2: "暂时无法确定当前位置",
            3: "获取当前位置超时",
          };
          const message = messages[error.code] || error.message || "获取当前位置失败";
          setCurrentLocation(null);
          setLocationStatus("error");
          setLocationError(message);
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        }
      );
    });
  };

  // Coloring is the only selection mechanism. Fresh photos start in the
  // default album; brushing the default color onto a default photo again
  // removes it from the import selection.
  const applyBrushColor = (path) => {
    if (!brushAlbum || alreadyImportedPaths.has(path)) return;

    const currentAlbum = selectedPaths.includes(path)
      ? photoAlbums[path] || "默认相册"
      : null;
    const shouldDeselect = brushAlbum === "默认相册"
      && currentAlbum === "默认相册";

    setSelectedPaths((current) => {
      if (shouldDeselect) {
        return current.filter((selectedPath) => selectedPath !== path);
      }
      return current.includes(path) ? current : [...current, path];
    });

    setPhotoAlbums((current) => {
      const updated = { ...current };
      if (shouldDeselect || brushAlbum === "默认相册") {
        delete updated[path];
      } else {
        updated[path] = brushAlbum;
      }
      return updated;
    });
  };

  // Set progress listeners
  useEffect(() => {
    let unlistenFn = null;
    const setupListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenFn = await listen("import-progress", (event) => {
        setImportProgress(event.payload);
      });
    };
    setupListener();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleStartImport = async () => {
    if (selectedImportPaths.length === 0) {
      alert("请至少选择一张照片进行导入！");
      return;
    }

    let importLocation = null;
    if (attachCurrentLocation) {
      try {
        importLocation = await requestCurrentLocation();
      } catch (error) {
        const continueWithoutLocation = confirm(
          `${error.message}\n\n是否继续导入，但不为缺少 GPS 的照片添加位置？`
        );
        if (!continueWithoutLocation) return;
      }
    }

    const startConfirm = confirm(
      "【导入提示】\n在导入期间，请保持电脑开机，挂载的设备接触稳定。确定开始导入吗？"
    );
    if (!startConfirm) return;

    setImporting(true);
    setImportProgress({ copied: 0, total: selectedImportPaths.length, current_file: "准备导入中..." });

    try {
      // Build PhotoImportInfo list
      const importsList = selectedImportPaths.map(path => ({
        absolute_path: path,
        album_name: photoAlbums[path] || "默认相册",
      }));

      const count = await invoke("import_photos", {
        imports: importsList,
        nameTemplate,
        backupPath: backupPath.trim() || null,
        currentLocation: attachCurrentLocation ? importLocation : null,
      });

      alert(`导入成功！共复制并注册了 ${count} 张照片。`);
      onImportComplete();
      onClose();
    } catch (e) {
      alert("导入失败: " + e);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // CSS multi-columns rebalance every time a preview settles or another batch
  // is appended, which makes cards jump while scrolling. Keep four explicit
  // columns so an already-rendered card always stays in the same column.
  const previewColumns = [[], [], [], []];
  filteredPhotos.slice(0, visibleLimit).forEach((photo, index) => {
    previewColumns[index % previewColumns.length].push(photo);
  });
  const visiblePhotos = filteredPhotos.slice(0, visibleLimit);
  const galleryPhoto = filteredPhotos.find((photo) => photo.absolute_path === galleryPath) || filteredPhotos[0];
  const albumBrushOptions = [
    { id: "__default_album__", name: "默认相册" },
    ...albums.filter((album) => album.name !== "默认相册"),
  ];

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem("photomanager-import-view", mode);
  };

  const handleColorAll = () => {
    const targetAlbum = brushAlbum || "默认相册";
    const importablePaths = photos
      .filter((photo) => !photo.already_imported)
      .map((photo) => photo.absolute_path);

    setSelectedPaths(importablePaths);
    if (targetAlbum === "默认相册") {
      setPhotoAlbums({});
    } else {
      setPhotoAlbums(Object.fromEntries(
        importablePaths.map((path) => [path, targetAlbum])
      ));
    }
  };

  const handleClearAllColors = () => {
    setSelectedPaths([]);
    setPhotoAlbums({});
  };

  const toggleImportedVisibility = () => {
    setHideImported((current) => !current);
    setVisibleLimit(64);
  };

  const toggleColoredVisibility = () => {
    setHideColored((current) => !current);
    setVisibleLimit(64);
  };

  const photoVisualState = (photo) => {
    const isChecked = selectedPaths.includes(photo.absolute_path);
    const targetAlbum = isChecked
      ? photoAlbums[photo.absolute_path] || "默认相册"
      : null;
    return {
      isChecked,
      targetAlbum,
      albumColor: targetAlbum ? getAlbumColor(targetAlbum) : "transparent",
    };
  };

  const handlePhotoPointerDown = (photo, event) => {
    event.preventDefault();
    if (photo.already_imported || paintedPathsRef.current.has(photo.absolute_path)) return;
    paintedPathsRef.current.add(photo.absolute_path);
    applyBrushColor(photo.absolute_path);
  };

  const handlePhotoPointerEnter = (photo) => {
    if (isMouseDownRef.current
      && !photo.already_imported
      && !paintedPathsRef.current.has(photo.absolute_path)) {
      paintedPathsRef.current.add(photo.absolute_path);
      applyBrushColor(photo.absolute_path);
    }
  };

  const handleGalleryPointerDown = (photo, event) => {
    event.preventDefault();
    setGalleryPath(photo.absolute_path);
    if (brushAlbum
      && !photo.already_imported
      && !paintedPathsRef.current.has(photo.absolute_path)) {
      paintedPathsRef.current.add(photo.absolute_path);
      applyBrushColor(photo.absolute_path);
    }
  };

  const renderImportMarkers = (photo) => {
    const { targetAlbum, albumColor } = photoVisualState(photo);
    return (
      <>
        {photo.already_imported && <div className="already-imported-badge">已存在</div>}
        {targetAlbum && (
          <div className="import-album-overlay" style={{ background: albumColor }}>
            📂 {targetAlbum}
          </div>
        )}
        {photo.is_raw && <div className="photo-card-badge import-raw-badge">RAW</div>}
      </>
    );
  };

  const renderImportIconView = () => (
    <div className="import-icon-grid">
      {visiblePhotos.map((photo) => {
        const { isChecked, targetAlbum, albumColor } = photoVisualState(photo);
        return (
          <div
            key={photo.absolute_path}
            className={`import-icon-item ${isChecked ? "selected" : ""} ${photo.already_imported ? "already-imported" : ""}`}
            style={{ "--album-color": albumColor, borderColor: photo.already_imported ? "#10b981" : targetAlbum ? albumColor : undefined }}
            onMouseDown={(event) => handlePhotoPointerDown(photo, event)}
            onMouseEnter={() => handlePhotoPointerEnter(photo)}
          >
            <div className="import-icon-thumbnail">
              <CardThumbnailImage path={photo.absolute_path} isRaw={photo.is_raw} scrollRoot={gridContainerRef} fit="cover" />
              {renderImportMarkers(photo)}
            </div>
            <div className="import-icon-name" title={photo.relative_path}>{photo.relative_path}</div>
          </div>
        );
      })}
    </div>
  );

  const renderImportListView = () => (
    <div className="import-list-view" role="table" aria-label="存储卡照片列表">
      <div className="import-list-header" role="row">
        <span>名称</span><span>拍摄日期</span><span>类型</span><span>大小</span><span>导入状态 / 相册</span>
      </div>
      {visiblePhotos.map((photo) => {
        const { isChecked, targetAlbum, albumColor } = photoVisualState(photo);
        return (
          <div
            key={photo.absolute_path}
            className={`import-list-row ${isChecked ? "selected" : ""} ${photo.already_imported ? "already-imported" : ""}`}
            style={{ "--album-color": albumColor }}
            role="row"
            onMouseDown={(event) => handlePhotoPointerDown(photo, event)}
            onMouseEnter={() => handlePhotoPointerEnter(photo)}
          >
            <span className="import-list-name">
              <span className="import-list-thumb">
                <CardThumbnailImage path={photo.absolute_path} isRaw={photo.is_raw} scrollRoot={gridContainerRef} fit="cover" />
              </span>
              <span title={photo.relative_path}>{photo.relative_path}</span>
            </span>
            <span>{photo.date_taken || "—"}</span>
            <span>{photo.is_raw ? "RAW" : photo.relative_path.split(".").pop()?.toUpperCase()}</span>
            <span>{(photo.size / (1024 * 1024)).toFixed(2)} MB</span>
            <span className="import-list-status">
              {photo.already_imported ? (
                <strong className="is-imported">✓ 已导入</strong>
              ) : isChecked ? (
                <strong style={{ color: albumColor }}>● {targetAlbum}</strong>
              ) : (
                <strong className="is-skipped">不导入</strong>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderImportGalleryView = () => galleryPhoto && (
    <div className="import-gallery-view">
      <div
        className={`import-gallery-stage ${galleryPhoto.already_imported ? "already-imported" : ""}`}
        style={{
          "--album-color": photoVisualState(galleryPhoto).albumColor,
          borderColor: galleryPhoto.already_imported
            ? "#10b981"
            : photoVisualState(galleryPhoto).targetAlbum
            ? photoVisualState(galleryPhoto).albumColor
            : photoVisualState(galleryPhoto).isChecked
            ? "var(--primary-start)"
            : undefined,
        }}
        onMouseDown={(event) => {
          if (brushAlbum) handlePhotoPointerDown(galleryPhoto, event);
        }}
      >
        <CardThumbnailImage path={galleryPhoto.absolute_path} isRaw={galleryPhoto.is_raw} scrollRoot={gridContainerRef} fit="contain" />
        {renderImportMarkers(galleryPhoto)}
        <div className="import-gallery-caption">
          <strong>{galleryPhoto.relative_path}</strong>
          <span>{galleryPhoto.date_taken} · {(galleryPhoto.size / (1024 * 1024)).toFixed(2)} MB</span>
        </div>
      </div>
      <div className="import-gallery-filmstrip" aria-label="存储卡照片胶片带">
        {filteredPhotos.map((photo) => {
          const { isChecked, targetAlbum, albumColor } = photoVisualState(photo);
          return (
            <button
              type="button"
              key={photo.absolute_path}
              className={`import-gallery-film ${galleryPhoto.absolute_path === photo.absolute_path ? "active" : ""} ${isChecked ? "selected" : ""} ${photo.already_imported ? "already-imported" : ""}`}
              style={{
                "--album-color": albumColor,
                borderColor: photo.already_imported
                  ? "#10b981"
                  : targetAlbum
                  ? albumColor
                  : isChecked
                  ? "var(--primary-start)"
                  : undefined,
              }}
              onMouseDown={(event) => handleGalleryPointerDown(photo, event)}
              onMouseEnter={() => {
                if (brushAlbum) handlePhotoPointerEnter(photo);
              }}
              title={photo.relative_path}
            >
              <CardThumbnailImage path={photo.absolute_path} isRaw={photo.is_raw} scrollRoot={gridContainerRef} fit="cover" />
              {photo.already_imported && <span className="import-film-status imported">已导入</span>}
              {!photo.already_imported && targetAlbum && <span className="import-film-status" style={{ background: albumColor }}>{targetAlbum}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="wizard-overlay fullscreen">
      <div className={`wizard-card fullscreen glass-panel ${brushAlbum ? "brush-cursor" : ""}`}>
        {/* Header */}
        <div className="content-header">
          <div className="header-title-area">
            <span className="header-title">📷 相机存储卡与磁盘导入向导</span>
            <span className="header-path">选择源路径并分配相册，轻松整理物理文件夹</span>
          </div>
          <button className="lightbox-close" onClick={onClose} style={{ position: "relative", top: 0, right: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="wizard-body">
          {/* Sidebar Config */}
          <div className="wizard-sidebar" style={{ width: "320px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Custom Path Selector */}
            <div className="sidebar-section">
              <span className="section-hdr">📂 选择导入源</span>
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                <input
                  type="text"
                  className="text-input"
                  value={sourcePath}
                  onChange={(e) => handleSelectSource(e.target.value)}
                  placeholder="导入来源文件夹路径"
                  style={{ fontSize: "11px", padding: "6px" }}
                />
                <button onClick={handleBrowseSourceFolder} className="gradient-btn" style={{ padding: "6px 12px", width: "auto", fontSize: "11px" }}>浏览</button>
              </div>
              
              {/* Removable devices helper list */}
              {cards.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>快速选择已连接的外部存储:</span>
                  {cards.map(c => (
                    <button
                      key={c.path}
                      onClick={() => handleSelectSource(c.path)}
                      className="text-input"
                      style={{ padding: "6px", textAlign: "left", fontSize: "11px", background: sourcePath === c.path ? "rgba(96,165,250,0.1)" : "none" }}
                    >
                      💾 [{c.drive_letter}] {c.label || "移动磁盘"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Brush Album Selector */}
            <div className="sidebar-section" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span className="section-hdr" style={{ margin: 0 }}>🎨 相册染色刷</span>
                <button
                  onClick={() => setShowCreateAlbum(true)}
                  style={{ background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}
                  title="新建相册"
                >
                  ＋新建
                </button>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 10px 0", lineHeight: 1.4 }}>
                新照片默认染为<strong>默认相册</strong>。选择相册后点击或拖拽照片即可分类；用默认相册再次染色默认照片，可取消该照片的导入。
              </p>

              {/* Album brush rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flexGrow: 1, maxHeight: "200px" }}>
                {albumBrushOptions.map((alb) => {
                  const isActive = brushAlbum === alb.name;
                  const color = getAlbumColor(alb.name);
                  return (
                    <div
                      key={alb.id}
                      onClick={() => setBrushAlbum(isActive ? null : alb.name)}
                      className={`text-input`}
                      style={{
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        background: isActive ? color : "rgba(255,255,255,0.02)",
                        color: isActive ? "#FFF" : "var(--text-main)",
                        border: `1px solid ${isActive ? color : "var(--border-color)"}`,
                        borderRadius: "8px",
                        fontWeight: isActive ? "600" : "normal",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, display: "inline-block", border: "1px solid rgba(255,255,255,0.2)" }} />
                        {alb.name}
                      </span>
                      {isActive && <span style={{ fontSize: "11px" }}>🖌️ 刷子激活</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-section import-location-section">
              <div className="import-location-heading">
                <span className="section-hdr">导入位置</span>
                <label className="import-location-switch">
                  <input
                    type="checkbox"
                    checked={attachCurrentLocation}
                    onChange={(event) => {
                      setAttachCurrentLocation(event.target.checked);
                      if (!event.target.checked) {
                        setCurrentLocation(null);
                        setLocationStatus("idle");
                        setLocationError("");
                      }
                    }}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
              <p className="import-location-description">
                为缺少 GPS 的照片自动加入导入时的当前位置；照片原有坐标不会被覆盖。
              </p>
              {attachCurrentLocation && (
                <div className={`import-location-status is-${locationStatus}`}>
                  <div>
                    <strong>
                      {locationStatus === "locating" && "正在获取位置…"}
                      {locationStatus === "ready" && "已获取当前位置"}
                      {locationStatus === "error" && "位置不可用"}
                      {locationStatus === "idle" && "将在导入时获取"}
                    </strong>
                    {currentLocation && (
                      <small>
                        {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
                      </small>
                    )}
                    {locationError && <small>{locationError}</small>}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestCurrentLocation().catch(() => {})}
                    disabled={locationStatus === "locating"}
                  >
                    {locationStatus === "ready" ? "刷新" : "立即获取"}
                  </button>
                </div>
              )}
            </div>

            {/* Reorganize Options */}
            <div className="sidebar-section">
              <span className="section-hdr">⚙️ 命名与备份</span>
              <div className="input-group">
                <span className="input-label" style={{ fontSize: "11px" }}>重命名规则</span>
                <select
                  value={nameTemplate}
                  onChange={(e) => setNameTemplate(e.target.value)}
                  className="text-input"
                  style={{ fontSize: "11px", padding: "6px" }}
                >
                  <option value="{time}_{original}">时间_原始文件名</option>
                  <option value="{date}_{time}">日期_时间</option>
                  <option value="{original}">保持原始文件名</option>
                </select>
              </div>
              <div className="input-group" style={{ marginTop: "8px" }}>
                <span className="input-label" style={{ fontSize: "11px" }}>备份目录 (可选)</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    className="text-input"
                    value={backupPath}
                    onChange={(e) => setBackupPath(e.target.value)}
                    placeholder="导入时自动同步备份至此路径"
                    style={{ fontSize: "11px", padding: "6px" }}
                  />
                  <button onClick={handleBrowseBackupFolder} className="gradient-btn" style={{ padding: "6px 12px", width: "auto", fontSize: "11px" }}>浏览</button>
                </div>
              </div>
            </div>

            {/* Start Import Button */}
            <button
              onClick={handleStartImport}
              className="gradient-btn"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: "600" }}
              disabled={importing || scanning}
            >
              📥 开始拷贝并导入 ({selectedImportPaths.length} 张)
            </button>
          </div>

          {/* Photo Display Grid */}
          <div
            ref={gridContainerRef}
            className="wizard-grid-container"
            style={{ flexGrow: 1, padding: "20px 20px 88px", overflowY: "auto", position: "relative" }}
            onMouseDownCapture={() => {
              isMouseDownRef.current = true;
              paintedPathsRef.current.clear();
            }}
            onMouseUp={() => { isMouseDownRef.current = false; }}
            onMouseLeave={() => { isMouseDownRef.current = false; }}
          >
            {scanning ? (
              <div className="empty-state">
                <div className="spinner"></div>
                <div style={{ marginTop: "12px" }}>正在读取存储卡内的照片树...</div>
              </div>
            ) : photos.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: "40px" }}>📂</div>
                <div style={{ marginTop: "12px", color: "var(--text-muted)" }}>请选择有效的导入源路径</div>
              </div>
            ) : (
              <>
                <div className="import-browser-toolbar">
                  <div>
                    <strong>显示 {filteredPhotos.length} / {photos.length} 张照片</strong>
                    <span>已染色并准备导入 {selectedImportPaths.length} 张</span>
                  </div>
                  <div className="finder-view-switcher" role="group" aria-label="导入图片预览方式">
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
                        aria-label={`${label}视图`}
                        aria-pressed={viewMode === mode}
                        title={`${label}视图`}
                      >
                        <span aria-hidden="true">{icon}</span><small>{label}</small>
                      </button>
                    ))}
                  </div>
                </div>
                {importedCount > 0 && (
                  <div className="already-imported-summary" role="status">
                    已检测到 {importedCount} 张照片曾导入当前仓库，已用绿色标记并取消选择。
                  </div>
                )}
                {filteredPhotos.length === 0 ? (
                  <div className="import-filter-empty">
                    <strong>当前筛选条件下没有照片</strong>
                    <span>可以关闭上方的隐藏选项，或重新进行染色。</span>
                  </div>
                ) : viewMode === "list" ? renderImportListView() :
                  viewMode === "icons" ? renderImportIconView() :
                  viewMode === "gallery" ? renderImportGalleryView() : (
                  <div className="wizard-photos-grid">
                {previewColumns.map((column, columnIndex) => (
                  <div className="wizard-photo-column" key={columnIndex}>
                    {column.map((photo) => {
                      const { targetAlbum, albumColor } = photoVisualState(photo);
                      const hasColor = !!targetAlbum;

                      return (
                        <div
                          key={photo.absolute_path}
                          className={`wizard-photo-card ${photo.already_imported ? "already-imported" : ""}`}
                          onMouseDown={(event) => handlePhotoPointerDown(photo, event)}
                          onMouseEnter={() => handlePhotoPointerEnter(photo)}
                          style={{
                            border: photo.already_imported
                              ? "2px solid #10B981"
                              : hasColor
                              ? `3px solid ${albumColor}`
                              : "2px solid transparent",
                            background: hasColor ? `${albumColor}22` : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{ position: "relative", width: "100%" }}>
                            <CardThumbnailImage
                              path={photo.absolute_path}
                              isRaw={photo.is_raw}
                              scrollRoot={gridContainerRef}
                            />
                            {/* Duplication green badge */}
                            {photo.already_imported && (
                              <div className="already-imported-badge">
                                已存在
                              </div>
                            )}

                            {/* Targeted Album Tag overlay at bottom */}
                            {hasColor && (
                              <div style={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: albumColor,
                                color: "white",
                                fontSize: "10px",
                                padding: "4px 8px",
                                fontWeight: "600",
                                textAlign: "center",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                zIndex: 10,
                              }}>
                                📂 {targetAlbum}
                              </div>
                            )}

                            {/* Raw badge */}
                            {photo.is_raw && (
                              <div className="photo-card-badge" style={{ zIndex: 5 }}>RAW</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                </div>
                )}
                {viewMode !== "gallery" && visibleLimit < filteredPhotos.length && (
                  <div ref={sentinelRef} className="wizard-preview-sentinel">
                    正在准备更多预览…
                  </div>
                )}
                <div className="import-quick-actions" role="toolbar" aria-label="导入快捷操作">
                  <button type="button" onClick={handleColorAll} className="color-all">
                    <span className="quick-action-dot" style={{ background: getAlbumColor(brushAlbum || "默认相册") }} />
                    全部染为“{brushAlbum || "默认相册"}”
                  </button>
                  <button type="button" onClick={handleClearAllColors} disabled={selectedImportPaths.length === 0}>
                    ◌ 全部取消染色
                  </button>
                  <span className="import-quick-divider" />
                  <button
                    type="button"
                    className={hideImported ? "active" : ""}
                    onClick={toggleImportedVisibility}
                    aria-pressed={hideImported}
                  >
                    {hideImported ? "✓" : "○"} 隐藏已导入 ({importedCount})
                  </button>
                  <button
                    type="button"
                    className={hideColored ? "active" : ""}
                    onClick={toggleColoredVisibility}
                    aria-pressed={hideColored}
                  >
                    {hideColored ? "✓" : "○"} 隐藏已染色 ({selectedImportPaths.length})
                  </button>
                </div>
              </>
            )}

          </div>
        </div>

        {/* Modal: Create Album Popup inside wizard */}
        {showCreateAlbum && (
          <div className="wizard-overlay" style={{ zIndex: 1200 }}>
            <div className="welcome-card glass-panel" style={{ maxWidth: "360px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span className="header-title" style={{ fontSize: "15px" }}>🆕 创建新相册</span>
                <button className="photo-action-btn" onClick={() => setShowCreateAlbum(false)} style={{ fontSize: "18px", padding: 0 }}>×</button>
              </div>
              <form onSubmit={handleCreateAlbumSubmit}>
                <div className="input-group">
                  <span className="input-label" style={{ fontSize: "12px" }}>相册名称</span>
                  <input
                    type="text"
                    className="text-input"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="例如: 旅行相册"
                    required
                  />
                </div>
                <div className="input-group" style={{ marginTop: "10px" }}>
                  <span className="input-label" style={{ fontSize: "12px" }}>描述 (可选)</span>
                  <input
                    type="text"
                    className="text-input"
                    value={newAlbumDesc}
                    onChange={(e) => setNewAlbumDesc(e.target.value)}
                    placeholder="例如: 自动归档相机导入照片"
                  />
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button type="submit" className="gradient-btn" style={{ flexGrow: 1, padding: "8px", borderRadius: "6px", fontSize: "12px" }}>创建</button>
                  <button type="button" onClick={() => setShowCreateAlbum(false)} className="text-input" style={{ width: "80px", padding: "8px", borderRadius: "6px", fontSize: "12px" }}>取消</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Progress Overlay */}
        {importing && importProgress && (
          <div className="progress-overlay">
            <div className="spinner"></div>
            <div className="progress-box">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span>📥 正在拷入并分析照片...</span>
                <span style={{ fontWeight: 600 }}>{importProgress.copied} / {importProgress.total}</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{ width: `${importProgress.total > 0 ? (importProgress.copied / importProgress.total) * 100 : 0}%` }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-dark)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", textAlign: "center" }}>
                正在拷贝: {importProgress.current_file}
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
