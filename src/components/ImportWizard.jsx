import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadPathThumbnail } from "../lib/thumbnailLoader";

// Sub-component to lazy load locally cached preview URLs from a storage path
function CardThumbnailImage({ path, isRaw, scrollRoot }) {
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
      className="import-thumbnail-frame"
      style={{ aspectRatio }}
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
            if (naturalWidth > 0 && naturalHeight > 0) {
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

  // New Album Dialog inside Wizard
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");

  const isMouseDownRef = useRef(false);

  // Keep the four-column masonry layout responsive with large storage cards:
  // render an initial batch, then extend it while the user approaches the end.
  useEffect(() => {
    const container = gridContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel || visibleLimit >= photos.length) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleLimit((previous) => Math.min(photos.length, previous + 64));
        }
      },
      { root: container, rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [photos.length, visibleLimit]);

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
    try {
      // scan_card takes (state, path)
      const list = await invoke("scan_card", { path });
      setPhotos(list);
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

  // Toggle checkmark selection
  const toggleSelectPhoto = (path) => {
    if (selectedPaths.includes(path)) {
      setSelectedPaths(selectedPaths.filter(p => p !== path));
    } else {
      setSelectedPaths([...selectedPaths, path]);
    }
  };

  // Apply brush coloring (either click or drag)
  const applyBrushColor = (path) => {
    if (brushAlbum) {
      if (photoAlbums[path] === brushAlbum) {
        // Deselect colored album, reverts to default
        const updated = { ...photoAlbums };
        delete updated[path];
        setPhotoAlbums(updated);
      } else {
        // Color it with brush album
        setPhotoAlbums({
          ...photoAlbums,
          [path]: brushAlbum,
        });
      }
    } else {
      toggleSelectPhoto(path);
    }
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
    if (selectedPaths.length === 0) {
      alert("请至少选择一张照片进行导入！");
      return;
    }

    // Check if there are uncolored pictures
    const uncoloredSelected = selectedPaths.filter(path => !photoAlbums[path]);
    if (uncoloredSelected.length > 0) {
      const confirmImport = confirm(
        `有 ${uncoloredSelected.length} 张已选中的图片未指定相册，它们在导入时将自动归入“默认相册”。确定要继续吗？`
      );
      if (!confirmImport) return;
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
    setImportProgress({ copied: 0, total: selectedPaths.length, current_file: "准备导入中..." });

    try {
      // Build PhotoImportInfo list
      const importsList = selectedPaths.map(path => ({
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
  photos.slice(0, visibleLimit).forEach((photo, index) => {
    previewColumns[index % previewColumns.length].push(photo);
  });

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
                点击下方相册开启<strong>染色刷</strong>，随后在右侧点击或<strong>拖拽划过</strong>照片，即可把它们归入所选相册。再次点击相册关闭染色刷。
              </p>

              {/* Album brush rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flexGrow: 1, maxHeight: "200px" }}>
                {albums.map((alb) => {
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
              📥 开始拷贝并导入 ({selectedPaths.length} 张)
            </button>
          </div>

          {/* Photo Display Grid */}
          <div
            ref={gridContainerRef}
            className="wizard-grid-container"
            style={{ flexGrow: 1, padding: "20px", overflowY: "auto", position: "relative" }}
            onMouseDown={() => { isMouseDownRef.current = true; }}
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
              <div className="wizard-photos-grid">
                {previewColumns.map((column, columnIndex) => (
                  <div className="wizard-photo-column" key={columnIndex}>
                    {column.map((photo) => {
                      const isChecked = selectedPaths.includes(photo.absolute_path);
                      const targetAlbum = photoAlbums[photo.absolute_path];
                      const hasColor = !!targetAlbum;
                      const albumColor = hasColor ? getAlbumColor(targetAlbum) : "transparent";

                      return (
                        <div
                          key={photo.absolute_path}
                          className={`wizard-photo-card ${photo.already_imported ? "already-imported" : ""}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (photo.already_imported) return; // Prevent tagging already imported photos
                            applyBrushColor(photo.absolute_path);
                          }}
                          onMouseEnter={() => {
                            if (isMouseDownRef.current && !photo.already_imported) {
                              applyBrushColor(photo.absolute_path);
                            }
                          }}
                          style={{
                            border: photo.already_imported
                              ? "2px solid #10B981"
                              : hasColor
                              ? `3px solid ${albumColor}`
                              : isChecked
                              ? "2px solid var(--primary-start)"
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

                            {/* Checkmarked top checkbox */}
                            {!photo.already_imported && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectPhoto(photo.absolute_path);
                                }}
                                style={{
                                  position: "absolute",
                                  top: "8px",
                                  right: "8px",
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "4px",
                                  background: isChecked ? "var(--primary-start)" : "rgba(0,0,0,0.6)",
                                  border: "1px solid rgba(255,255,255,0.4)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "white",
                                  fontWeight: "bold",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  zIndex: 10,
                                }}
                              >
                                {isChecked && "✓"}
                              </div>
                            )}

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
                {visibleLimit < photos.length && (
                  <div ref={sentinelRef} className="wizard-preview-sentinel">
                    正在准备更多预览…
                  </div>
                )}
              </div>
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
