import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import WorkspaceSelector from "./components/WorkspaceSelector";
import TimelineGrid from "./components/TimelineGrid";
import ImportWizard from "./components/ImportWizard";
import LightboxViewer from "./components/LightboxViewer";

function App() {
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [currentView, setCurrentView] = useState("photos"); // "photos", "favorites", "trash", "album"
  const [activeAlbumId, setActiveAlbumId] = useState(null);
  const [activeAlbumName, setActiveAlbumName] = useState("");
  
  const [albums, setAlbums] = useState([]);
  const [detectedCard, setDetectedCard] = useState(null);
  
  // Modals
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [lightboxData, setLightboxData] = useState(null); // { photosList, index }
  
  // Triggers
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");

  // Check active workspace on mount
  useEffect(() => {
    checkActiveWorkspace();
  }, []);

  // Poll for SD card detection every 8 seconds
  useEffect(() => {
    if (!activeWorkspace) return;
    
    // Check initially
    checkSDCards();

    const interval = setInterval(() => {
      checkSDCards();
    }, 8000);

    return () => clearInterval(interval);
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeWorkspace) {
      loadAlbums();
    }
  }, [activeWorkspace, refreshTrigger]);

  const checkActiveWorkspace = async () => {
    try {
      const activePath = await invoke("get_active_workspace");
      if (activePath) {
        // Find workspace name in recent list
        const workspaces = await invoke("get_workspaces");
        const match = workspaces.find((w) => w.path === activePath);
        if (match) {
          setActiveWorkspace(match);
        } else {
          // If not found in list, fallback
          const folderName = activePath.split(/[/\\]/).pop() || "本地相册";
          setActiveWorkspace({ name: folderName, path: activePath });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const checkSDCards = async () => {
    try {
      const cards = await invoke("detect_cards");
      if (cards.length > 0) {
        setDetectedCard(cards[0]);
      } else {
        setDetectedCard(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAlbums = async () => {
    try {
      const list = await invoke("get_albums");
      setAlbums(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectWorkspace = (ws) => {
    setActiveWorkspace(ws);
    setCurrentView("photos");
    setActiveAlbumId(null);
  };

  const handleSwitchWorkspace = () => {
    if (confirm("确定要切换仓库吗？")) {
      setActiveWorkspace(null);
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
      loadAlbums();
    } catch (err) {
      alert("创建相册失败: " + err);
    }
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const getHeaderTitle = () => {
    switch (currentView) {
      case "photos":
        return "全部照片";
      case "favorites":
        return "收藏夹";
      case "trash":
        return "最近删除回收站";
      case "album":
        return `相册: ${activeAlbumName}`;
      default:
        return "图库";
    }
  };

  // If no workspace is active, show Welcome screen
  if (!activeWorkspace) {
    return <WorkspaceSelector onSelectWorkspace={handleSelectWorkspace} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="main-sidebar glass-panel" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 16, borderBottomRightRadius: 16 }}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#sidebarGrad)" strokeWidth="2.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
              <defs>
                <linearGradient id="sidebarGrad" x1="1" y1="3" x2="23" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#60A5FA" />
                  <stop offset="1" stopColor="#C084FC" />
                </linearGradient>
              </defs>
            </svg>
            <span className="gradient-text">PhotoGallery</span>
          </div>
          <button
            onClick={handleSwitchWorkspace}
            title="切换仓库"
            style={{ background: "none", border: "none", color: "var(--text-dark)", cursor: "pointer", display: "flex" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div
            className={`nav-item ${currentView === "photos" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("photos");
              setActiveAlbumId(null);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span>时间线相册</span>
          </div>
          
          <div
            className={`nav-item ${currentView === "favorites" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("favorites");
              setActiveAlbumId(null);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>我的喜欢</span>
          </div>
          
          <div
            className={`nav-item ${currentView === "trash" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("trash");
              setActiveAlbumId(null);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <span>最近删除</span>
          </div>
        </nav>

        <div className="sidebar-divider"></div>

        {/* Albums Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span className="sidebar-section-title">自建相册</span>
          <button
            onClick={() => setShowCreateAlbum(true)}
            style={{ background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
          >
            ＋
          </button>
        </div>

        {/* Albums List */}
        <div className="albums-list">
          {albums.map((album) => (
            <div
              key={album.id}
              className={`album-item ${currentView === "album" && activeAlbumId === album.id ? "active" : ""}`}
              onClick={() => {
                setCurrentView("album");
                setActiveAlbumId(album.id);
                setActiveAlbumName(album.name);
              }}
            >
              <span>📁 {album.name}</span>
              <span className="album-count">{album.photo_count || 0}</span>
            </div>
          ))}
        </div>

        {/* SD Card Detection Banner */}
        {detectedCard && (
          <div className="sdcard-banner">
            <div className="sdcard-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "pulse-green 1.5s infinite" }}>
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="14" x2="12" y2="14"></line>
                <polyline points="8 6 12 6 16 6"></polyline>
              </svg>
              <span>检测到相机存储卡!</span>
            </div>
            <button
              onClick={() => setShowImportWizard(true)}
              className="gradient-btn"
              style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px" }}
            >
              立即导入照片
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="content-wrapper">
        <div className="content-header">
          <div className="header-title-area">
            <span className="header-title">{getHeaderTitle()}</span>
            <span className="header-path">🏢 当前仓库: {activeWorkspace.name} ({activeWorkspace.path})</span>
          </div>
          <div className="header-actions">
            <button
              onClick={() => setShowImportWizard(true)}
              className="text-input gradient-btn"
              style={{ width: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}
            >
              📥 导入新照片
            </button>
          </div>
        </div>

        {/* Timeline Photo Grid */}
        <TimelineGrid
          currentView={currentView}
          albumId={activeAlbumId}
          refreshTrigger={refreshTrigger}
          onPhotosUpdated={triggerRefresh}
          onPhotoClick={(list, index) => setLightboxData({ photosList: list, index })}
        />
      </main>

      {/* Modal: Create Album Popup */}
      {showCreateAlbum && (
        <div className="wizard-overlay" style={{ zIndex: 1100 }}>
          <div className="welcome-card glass-panel" style={{ maxWidth: "400px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span className="header-title" style={{ fontSize: "16px" }}>🆕 创建新相册</span>
              <button
                className="photo-action-btn"
                onClick={() => setShowCreateAlbum(false)}
                style={{ fontSize: "18px", padding: 0 }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateAlbumSubmit}>
              <div className="input-group">
                <span className="input-label">相册名称</span>
                <input
                  type="text"
                  className="text-input"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  placeholder="例如: 杭州之旅"
                  required
                />
              </div>
              <div className="input-group">
                <span className="input-label">描述 (可选)</span>
                <input
                  type="text"
                  className="text-input"
                  value={newAlbumDesc}
                  onChange={(e) => setNewAlbumDesc(e.target.value)}
                  placeholder="例如: 2026年夏季拍摄"
                />
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="gradient-btn" style={{ flexGrow: 1, padding: "10px", borderRadius: "6px" }}>
                  创建
                </button>
                <button type="button" onClick={() => setShowCreateAlbum(false)} className="text-input" style={{ width: "100px", padding: "10px", borderRadius: "6px" }}>
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Wizard */}
      {showImportWizard && (
        <ImportWizard
          onClose={() => setShowImportWizard(false)}
          onImportComplete={triggerRefresh}
        />
      )}

      {/* Modal: Lightbox Viewer */}
      {lightboxData && (
        <LightboxViewer
          photosList={lightboxData.photosList}
          initialIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
          onPhotosUpdated={triggerRefresh}
        />
      )}
    </div>
  );
}

export default App;
