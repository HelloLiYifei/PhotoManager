import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import WorkspaceSelector from "./components/WorkspaceSelector";
import TimelineGrid from "./components/TimelineGrid";
import ImportWizard from "./components/ImportWizard";
import LightboxViewer from "./components/LightboxViewer";
import MapView from "./components/MapView";
import { loadPhotoThumbnail } from "./lib/thumbnailLoader";

function App() {
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [currentView, setCurrentView] = useState("albums"); // "albums", "album", "favorites", "trash", "map"
  const [activeAlbumId, setActiveAlbumId] = useState(null);
  const [activeAlbumName, setActiveAlbumName] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [albums, setAlbums] = useState([]);
  const [detectedCard, setDetectedCard] = useState(null);
  
  // Modals
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [lightboxData, setLightboxData] = useState(null); // { photosList, index }
  const [mapFocusedPhotoId, setMapFocusedPhotoId] = useState(null);
  
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
      const updatedList = await Promise.all(list.map(async (alb) => {
        const photos = await invoke("get_photos", {
          search: null,
          favoriteOnly: false,
          deletedOnly: false,
          albumId: alb.id,
          ratingFilter: null,
          tagFilter: null,
        });
        return {
          ...alb,
          coverPhotoId: photos.length > 0 ? photos[0].id : null,
          photoCount: photos.length,
        };
      }));
      setAlbums(updatedList);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectWorkspace = (ws) => {
    setActiveWorkspace(ws);
    setCurrentView("albums");
    setActiveAlbumId(null);
  };

  const handleSwitchWorkspace = () => {
    if (confirm("确定要返回选择仓库界面吗？")) {
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
      case "albums":
        return "📁 相册";
      case "favorites":
        return "💖 我的喜欢";
      case "trash":
        return "🗑️ 垃圾桶";
      case "map":
        return "🌍 地图";
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
      <aside className={`main-sidebar glass-panel ${isSidebarCollapsed ? "collapsed" : ""}`} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 16, borderBottomRightRadius: 16 }}>
        <div className="sidebar-header" style={{ cursor: "pointer" }} onClick={handleSwitchWorkspace}>
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
            <span className="gradient-text sidebar-text">PhotoGallery</span>
          </div>
          {!isSidebarCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchWorkspace();
              }}
              title="返回选择仓库"
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div
            className={`nav-item ${currentView === "albums" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("albums");
              setActiveAlbumId(null);
            }}
            title="相册"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span className="nav-text">相册</span>
          </div>
          
          <div
            className={`nav-item ${currentView === "favorites" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("favorites");
              setActiveAlbumId(null);
            }}
            title="我的喜欢"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span className="nav-text">我的喜欢</span>
          </div>

          <div
            className={`nav-item ${currentView === "map" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("map");
              setActiveAlbumId(null);
              setMapFocusedPhotoId(null);
            }}
            title="地图"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span className="nav-text">地图</span>
          </div>
          
          <div
            className={`nav-item ${currentView === "trash" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("trash");
              setActiveAlbumId(null);
            }}
            title="垃圾桶"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <span className="nav-text">垃圾桶</span>
          </div>
        </nav>

        <div className="sidebar-divider"></div>

        {/* Albums Header with Fold button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", padding: "0 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="sidebar-section-title sidebar-text" style={{ margin: 0 }}>快捷列表</span>
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title={isSidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            >
              {isSidebarCollapsed ? "▶" : "◀"}
            </button>
          </div>
          {!isSidebarCollapsed && (
            <button
              onClick={() => setShowCreateAlbum(true)}
              style={{ background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", fontWeight: 600, fontSize: "16px", padding: 0 }}
              title="新建相册"
            >
              ＋
            </button>
          )}
        </div>

        {/* Albums List */}
        <div className="albums-list" style={{ flexGrow: 1, overflowY: "auto" }}>
          {albums.map((album) => (
            <div
              key={album.id}
              className={`album-item ${currentView === "album" && activeAlbumId === album.id ? "active" : ""}`}
              onClick={() => {
                setCurrentView("album");
                setActiveAlbumId(album.id);
                setActiveAlbumName(album.name);
              }}
              title={album.name}
            >
              <span className="album-name">📁 {album.name}</span>
              <span className="album-count" style={{ display: isSidebarCollapsed ? "none" : "inline" }}>{album.photoCount || 0}</span>
            </div>
          ))}
        </div>

        {/* Settings button at bottom */}
        <div style={{ padding: "8px", borderTop: "1px solid var(--border-color)", marginTop: "auto" }}>
          <button
            onClick={() => alert(`⚙️ 设置\n工作空间路径:\n${activeWorkspace.path}\n相册存储格式: 物理目录直接映射`)}
            className="nav-item"
            style={{ width: "100%", background: "none", border: "none", padding: "8px", justifyContent: isSidebarCollapsed ? "center" : "flex-start", cursor: "pointer", gap: 0 }}
            title="设置"
          >
            ⚙️ <span className="sidebar-text" style={{ marginLeft: "8px" }}>设置</span>
          </button>
        </div>

        {/* SD Card Detection Banner */}
        {detectedCard && !isSidebarCollapsed && (
          <div className="sdcard-banner" style={{ margin: "10px" }}>
            <div className="sdcard-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "pulse-green 1.5s infinite" }}>
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="14" x2="12" y2="14"></line>
                <polyline points="8 6 12 6 16 6"></polyline>
              </svg>
              <span>检测到卡!</span>
            </div>
            <button
              onClick={() => setShowImportWizard(true)}
              className="gradient-btn"
              style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", marginTop: "4px", width: "100%" }}
            >
              导入照片
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="content-wrapper">
        <div className="content-header">
          <div className="header-title-area">
            <span className="header-title">{getHeaderTitle()}</span>
            <span className="header-path">🏢 仓库: {activeWorkspace.name}</span>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "10px" }}>
            {currentView === "trash" && (
              <button
                onClick={async () => {
                  if (confirm("确定要将垃圾桶内的所有照片全部移入系统回收站吗？物理文件将被移动到系统回收站，数据库记录将被删除。")) {
                    try {
                      await invoke("empty_trash_to_recycle_bin");
                      triggerRefresh();
                      alert("已全部移入系统回收站！");
                    } catch (e) {
                      alert("清空失败: " + e);
                    }
                  }
                }}
                className="text-input"
                style={{ width: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", background: "rgba(239, 68, 68, 0.15)", color: "#FCA5A5", border: "1px solid rgba(239, 68, 68, 0.3)" }}
              >
                🗑️ 全部转移至回收站
              </button>
            )}
            <button
              onClick={() => setShowImportWizard(true)}
              className="text-input gradient-btn"
              style={{ width: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}
            >
              📥 导入新照片
            </button>
          </div>
        </div>

        {currentView === "map" ? (
          <MapView
            key={`map-${refreshTrigger}`}
            focusedPhotoId={mapFocusedPhotoId}
            onShowPhoto={(photo) => setLightboxData({ photosList: [photo], index: 0 })}
          />
        ) : currentView === "albums" ? (
          <div className="albums-grid animate-fade-in" style={{ overflowY: "auto", flexGrow: 1, paddingRight: "8px" }}>
            {/* Create Album Card */}
            <div className="album-card" onClick={() => setShowCreateAlbum(true)} style={{ borderStyle: "dashed", borderColor: "var(--accent-color)", background: "transparent", minHeight: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", color: "var(--accent-color)", fontSize: "14px" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>＋</div>
                <div style={{ fontWeight: "600" }}>创建新相册</div>
              </div>
            </div>

            {/* Existing Album Cards */}
            {albums.map((album) => (
              <div
                key={album.id}
                className="album-card animate-fade-in"
                onClick={() => {
                  setCurrentView("album");
                  setActiveAlbumId(album.id);
                  setActiveAlbumName(album.name);
                }}
              >
                <div className="album-cover-wrapper">
                  {album.coverPhotoId ? (
                    <AlbumCover photoId={album.coverPhotoId} />
                  ) : (
                    <span>空</span>
                  )}
                </div>
                <div className="album-card-info">
                  <div className="album-card-title">{album.name}</div>
                  <div className="album-card-desc">
                    {album.photoCount || 0} 张照片
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <TimelineGrid
            currentView={currentView}
            albumId={activeAlbumId}
            refreshTrigger={refreshTrigger}
            onPhotosUpdated={triggerRefresh}
            onPhotoClick={(list, index) => setLightboxData({ photosList: list, index })}
          />
        )}
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
          onShowOnMap={(photo) => {
            setMapFocusedPhotoId(photo.id);
            setLightboxData(null);
            setCurrentView("map");
          }}
          onPhotosUpdated={triggerRefresh}
        />
      )}
    </div>
  );
}

// Helper to load Cover Photo
function AlbumCover({ photoId }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!photoId) return;
    loadPhotoThumbnail(photoId)
      .then((b64) => setSrc(b64))
      .catch((e) => console.error(e));
  }, [photoId]);

  if (!src) {
    return <div className="album-cover-placeholder">加载中...</div>;
  }
  return <img src={src} className="album-cover-img" alt="封面" />;
}

export default App;
