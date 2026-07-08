import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

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

  // Detect drives on mount
  useEffect(() => {
    detectDrives();
  }, []);

  // Listen to import progress events from Rust backend
  useEffect(() => {
    let unlisten = null;
    async function setupListener() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("import-progress", (event) => {
        setImportProgress(event.payload);
      });
    }
    setupListener();
    return () => {
      if (unlisten) unlisten.then((f) => f());
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
                {photos.map((photo) => {
                  const isSel = selectedPhotos.includes(photo.absolute_path);
                  return (
                    <div
                      key={photo.absolute_path}
                      className={`wizard-grid-item ${isSel ? "selected" : ""}`}
                      onClick={() => handleTogglePhoto(photo.absolute_path)}
                    >
                      {/* We display a standard placeholder or try to read thumbnail. Since card files are remote, we don't have thumbnails cache generated yet, so we just show an icon or a generic representation. But RAW vs JPG badge helps! */}
                      <div style={{ width: "100%", height: "100%", background: "#1F1F2E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span style={{ fontSize: "10px", color: "var(--text-dark)", marginTop: "8px", textOverflow: "ellipsis", width: "90%", overflow: "hidden", textAlign: "center", whiteSpace: "nowrap" }}>
                          {photo.relative_path.split("\\").pop().split("/").pop()}
                        </span>
                        <span style={{ fontSize: "9px", color: "var(--text-dark)", marginTop: "2px" }}>
                          {(photo.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                      
                      <div className="checkbox-badge">✓</div>
                      {photo.is_raw && (
                        <div className="photo-card-badge" style={{ background: "#3B82F6" }}>RAW</div>
                      )}
                    </div>
                  );
                })}
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
