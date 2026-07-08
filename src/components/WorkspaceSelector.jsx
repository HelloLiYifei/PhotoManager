import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function WorkspaceSelector({ onSelectWorkspace }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [newWsName, setNewWsName] = useState("");
  const [newWsPath, setNewWsPath] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspacesList();
  }, []);

  const loadWorkspacesList = async () => {
    try {
      const list = await invoke("get_workspaces");
      // Sort by last opened descending
      list.sort((a, b) => b.last_opened.localeCompare(a.last_opened));
      setWorkspaces(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim() || !newWsPath.trim()) {
      setErrorMsg("请填写仓库名称和文件夹路径");
      return;
    }
    setErrorMsg("");
    try {
      const ws = await invoke("create_workspace", {
        name: newWsName.trim(),
        path: newWsPath.trim(),
      });
      onSelectWorkspace(ws);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleOpenWorkspace = async (path) => {
    setErrorMsg("");
    try {
      const ws = await invoke("open_workspace", { path });
      onSelectWorkspace(ws);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleDeleteWorkspace = async (id, e) => {
    e.stopPropagation(); // Avoid triggering open
    if (!confirm("确定要在记录中移除此仓库吗？（不会删除磁盘上的照片文件）")) {
      return;
    }
    try {
      await invoke("delete_workspace", { id });
      loadWorkspacesList();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleOpenExistingPath = async (e) => {
    e.preventDefault();
    if (!newWsPath.trim()) {
      setErrorMsg("请填写已有的文件夹路径");
      return;
    }
    setErrorMsg("");
    try {
      const ws = await invoke("open_workspace", { path: newWsPath.trim() });
      onSelectWorkspace(ws);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 7H16L14.5 5.5H9.5L8 7H5C3.9 7 3 7.9 3 9V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7Z" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 16C13.933 16 15.5 14.433 15.5 12.5C15.5 10.567 13.933 9 12 9C10.067 9 8.5 10.567 8.5 12.5C8.5 14.433 10.067 16 12 16Z" fill="url(#logoGrad)"/>
          <defs>
            <linearGradient id="logoGrad" x1="3" y1="5.5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="welcome-card glass-panel">
        <h2 className="welcome-title gradient-text">智能相机相册导入管理系统</h2>
        <p className="welcome-subtitle">开始您的专业级照片导入与整理之旅</p>

        {errorMsg && (
          <div style={{ color: "#EF4444", fontSize: "13px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "10px", marginBottom: "20px" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreateWorkspace}>
          <div className="input-group">
            <span className="input-label">📁 本地物理文件夹路径</span>
            <input
              type="text"
              className="text-input"
              value={newWsPath}
              onChange={(e) => setNewWsPath(e.target.value)}
              placeholder="例如：E:\Photos\MyGallery"
            />
          </div>

          <div className="input-group">
            <span className="input-label">🏷️ 仓库名称</span>
            <input
              type="text"
              className="text-input"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="例如：我的摄影图库"
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button
              type="submit"
              className="gradient-btn"
              style={{ flexGrow: 1, padding: "12px", borderRadius: "8px", fontSize: "14px" }}
            >
              创建并进入新仓库
            </button>
            <button
              type="button"
              onClick={handleOpenExistingPath}
              className="text-input"
              style={{ width: "160px", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", cursor: "pointer", background: "rgba(255,255,255,0.03)" }}
            >
              打开已有仓库
            </button>
          </div>
        </form>

        {workspaces.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <span className="input-label" style={{ display: "block", marginBottom: "12px" }}>🕒 最近打开的仓库</span>
            <div className="recent-list">
              {workspaces.map((ws) => (
                <div key={ws.id} className="recent-item" onClick={() => handleOpenWorkspace(ws.path)}>
                  <div className="recent-info">
                    <span className="recent-name">{ws.name}</span>
                    <span className="recent-path">{ws.path}</span>
                  </div>
                  <div
                    className="recent-delete"
                    title="从记录中移除"
                    onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
