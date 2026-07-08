import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// Sub-component to lazy load card photo thumbnails
function CardThumbnailImage({ path, isRaw }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef(null);

  useEffect(() => {
    let active = true;
    
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
        const b64 = await invoke("get_image_thumbnail_by_path", { path, isRaw });
        if (active) {
          setSrc(b64);
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

  if (loading) {
    return (
      <div ref={imgRef} style={{ width: "100%", height: "100%", background: "#1F1F2E", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent-color)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src || "/placeholder.svg"}
      alt="Preview"
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

export default function ImportWizard({ onClose, onImportComplete }) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  
  const [photos, setPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  
  const [folderTemplate, setFolderTemplate] = useState("{year}/{date}_{event}");
  const [nameTemplate, setNameTemplate] = useState("{time}_{original}");
  const [eventName, setEventName] = useState("");
  const [backupPath, setBackupPath] = useState("");
  
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [scanning, setScanning] = useState(false);
  
  const [visibleLimit, setVisibleLimit] = useState(48);
  const sentinelRef = useRef(null);

  // Auto load more when scroll reaches bottom
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleLimit((prev) => Math.min(photos.length, prev + 48));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleLimit, photos.length]);

  // Detect drives on mount
  useEffect(() => {
    detectDrives();
  }, []);

  // Listen to import progress events from Rust backend
  useEffect(() => {
    const unlistenPromise = (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      return listen("import-progress", (event) => {
        setImportProgress(event.payload);
      });
    })();

    return () => {
      unlistenPromise.then((unlistenFn) => unlistenFn());
    };
  }, []);

  const detectDrives = async () => {
    try {
      const detected = await invoke("detect_cards");
      setCards(detected);
      if (detected.length > 0) {
        handleSelectCard(detected[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectCard = async (card) => {
    setSelectedCard(card);
    setScanning(true);
    setPhotos([]);
    setVisibleLimit(48);
    try {
      const list = await invoke("scan_card", { path: card.path });
      setPhotos(list);
      // Select all photos by default
      setSelectedPhotos(list.map((p) => p.absolute_path));
    } catch (e) {
      alert("读取存储卡失败: " + e);
    } finally {
      setScanning(false);
    }
  };

  const handleTogglePhoto = (path) => {
    if (selectedPhotos.includes(path)) {
      setSelectedPhotos(selectedPhotos.filter((p) => p !== path));
    } else {
      setSelectedPhotos([...selectedPhotos, path]);
    }
  };

  const handleSelectAll = () => {
    setSelectedPhotos(photos.map((p) => p.absolute_path));
  };

  const handleSelectNone = () => {
    setSelectedPhotos([]);
  };

  const handleStartImport = async () => {
    if (selectedPhotos.length === 0) {
      alert("请至少勾选一张要导入的照片");
      return;
    }
    if (!eventName.trim() && folderTemplate.includes("{event}")) {
      alert("请输入活动名称，整理规则中包含了该字段");
      return;
    }

    setImporting(true);
    setImportProgress({ copied: 0, total: selectedPhotos.length, current_file: "准备复制中..." });

    try {
      const importedCount = await invoke("import_photos", {
        photoPaths: selectedPhotos,
        folderTemplate,
        nameTemplate,
        eventName: eventName.trim(),
        backupPath: backupPath.trim() || null,
      });

      alert(`导入成功！共导入 ${importedCount} 张照片`);
      onImportComplete();
      onClose();
    } catch (e) {
      alert("导入失败: " + e);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="wizard-overlay">
      <div className="wizard-card glass-panel">
        {/* Header */}
        <div className="content-header">
          <div className="header-title-area">
            <span className="header-title">📷 相机存储卡导入向导</span>
            <span className="header-path">自动侦测存储卡并复制照片到图库</span>
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
          <div className="wizard-sidebar">
            {/* Card Selector */}
            <div className="sidebar-section">
              <span className="section-hdr">📂 选择源存储卡</span>
              {cards.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", textAlign: "center" }}>
                  未检测到包含 DCIM 文件夹的移动存储设备...
                  <button onClick={detectDrives} className="text-input" style={{ width: "auto", marginTop: "8px", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                    🔄 重新检测
                  </button>
                </div>
              ) : (
                <select
                  value={selectedCard?.path || ""}
                  onChange={(e) => handleSelectCard(cards.find((c) => c.path === e.target.value))}
                  className="text-input"
                  style={{ fontSize: "13px" }}
                >
                  {cards.map((c) => (
                    <option key={c.path} value={c.path}>
                      {c.label} ({c.drive_letter})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Folder Rules */}
            <div className="sidebar-section">
              <span className="section-hdr">📁 整理规则 (存放文件夹)</span>
              <select
                value={folderTemplate}
                onChange={(e) => setFolderTemplate(e.target.value)}
                className="text-input"
                style={{ fontSize: "13px" }}
              >
                <option value="{year}/{date}_{event}">按年 / 拍摄日期_活动名称 (推荐)</option>
                <option value="{year}/{month}">按年 / 拍摄月份</option>
                <option value="{date}">按拍摄日期</option>
                <option value="导入照片">全部放在根目录下</option>
              </select>
            </div>

            {/* Event Name */}
            <div className="sidebar-section">
              <span className="section-hdr">🏷️ 活动/事件名称</span>
              <input
                type="text"
                className="text-input"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="例如: 杭州西湖外拍"
                style={{ fontSize: "13px" }}
              />
            </div>

            {/* Rename Rules */}
            <div className="sidebar-section">
              <span className="section-hdr">✏️ 文件名命名规则</span>
              <select
                value={nameTemplate}
                onChange={(e) => setNameTemplate(e.target.value)}
                className="text-input"
                style={{ fontSize: "13px" }}
              >
                <option value="{time}_{original}">拍摄时间_原始文件名</option>
                <option value="{date}_{time}">拍摄日期_拍摄时间</option>
                <option value="{original}">保持原始文件名</option>
              </select>
            </div>

            {/* Backup Path */}
            <div className="sidebar-section">
              <span className="section-hdr">🛡️ 二次备份路径 (可选)</span>
              <input
                type="text"
                className="text-input"
                value={backupPath}
                onChange={(e) => setBackupPath(e.target.value)}
                placeholder="例如: F:\PhotosBackup"
                style={{ fontSize: "13px" }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={detectDrives} className="text-input" style={{ cursor: "pointer", background: "rgba(255,255,255,0.03)" }}>
                🔄 重新检测卡
              </button>
              <button
                onClick={handleStartImport}
                disabled={photos.length === 0 || importing}
                className="gradient-btn"
                style={{ padding: "12px", borderRadius: "8px", fontSize: "14px" }}
              >
                {importing ? "正在导入..." : `开始导入 (${selectedPhotos.length}张)`}
              </button>
            </div>
          </div>

          {/* Main Content: Photo Grid */}
          <div className="wizard-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {scanning ? "🔍 正在扫描存储卡..." : `共发现 ${photos.length} 张照片 (已勾选 ${selectedPhotos.length} 张)`}
              </span>
              {photos.length > 0 && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={handleSelectAll} className="text-input" style={{ width: "auto", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}>全选</button>
                  <button onClick={handleSelectNone} className="text-input" style={{ width: "auto", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}>全不选</button>
                </div>
              )}
            </div>

            {scanning ? (
              <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                正在加载存储卡文件，这可能需要几秒钟...
              </div>
            ) : photos.length === 0 ? (
              <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                未发现相容格式的照片
              </div>
            ) : (
              <div className="wizard-grid">
                {photos.slice(0, visibleLimit).map((photo) => {
                  const isSel = selectedPhotos.includes(photo.absolute_path);
                  return (
                    <div
                      key={photo.absolute_path}
                      className={`wizard-grid-item ${isSel ? "selected" : ""}`}
                      onClick={() => handleTogglePhoto(photo.absolute_path)}
                    >
                      <CardThumbnailImage path={photo.absolute_path} isRaw={photo.is_raw} />
                      
                      <div className="checkbox-badge">✓</div>
                      {photo.is_raw && (
                        <div className="photo-card-badge" style={{ background: "#3B82F6" }}>RAW</div>
                      )}
                    </div>
                  );
                })}
                {visibleLimit < photos.length && (
                  <div ref={sentinelRef} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                    正在加载更多照片...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress Overlay */}
        {importing && importProgress && (
          <div className="progress-overlay">
            <h3 style={{ fontSize: "18px", fontWeight: "600" }}>正在导入照片中，请勿拔出存储卡...</h3>
            <div className="progress-box">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span>正在复制: {importProgress.copied} / {importProgress.total}</span>
                <span>{((importProgress.copied / importProgress.total) * 100).toFixed(0)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{ width: `${(importProgress.copied / importProgress.total) * 100}%` }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", textAlign: "center" }}>
                文件: {importProgress.current_file}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
