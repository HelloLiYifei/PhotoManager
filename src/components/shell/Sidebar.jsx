import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Folder,
  HardDriveDownload,
  Heart,
  Images,
  Import,
  Info,
  LogOut,
  MapPinned,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import "./Shell.css";

const NAVIGATION_ITEMS = [
  { id: "albums", label: "相册", Icon: Images },
  { id: "favorites", label: "我的喜欢", Icon: Heart },
  { id: "map", label: "地图", Icon: MapPinned },
  { id: "trash", label: "垃圾桶", Icon: Trash2 },
];

function getCurrentTitle(currentView, activeAlbumId, albums) {
  if (currentView === "album") {
    const album = albums.find((item) => item.id === activeAlbumId);
    return album?.name ?? "相册";
  }

  return (
    NAVIGATION_ITEMS.find((item) => item.id === currentView)?.label ?? "图库"
  );
}

function Sidebar({
  workspace,
  currentView,
  activeAlbumId,
  albums = [],
  detectedCard,
  mode = "expanded",
  currentTitle,
  onNavigate,
  onOpenAlbum,
  onCreateAlbum,
  onImport,
  onSwitchWorkspace,
  onToggleMode,
  onShowWorkspaceInfo,
  className = "",
}) {
  const isCollapsed = mode === "collapsed";
  const isOverlay = mode === "overlay";
  const resolvedTitle =
    currentTitle ?? getCurrentTitle(currentView, activeAlbumId, albums);
  const cardName = detectedCard?.label || detectedCard?.driveLetter;
  const importLabel = detectedCard ? "检测到存储卡 · 导入" : "导入新照片";
  const importDescription = detectedCard
    ? `检测到存储卡${cardName ? ` ${cardName}` : ""}，点击导入`
    : "导入新照片";
  const sidebarClassName = ["sidebar", `sidebar--${mode}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      id="primary-sidebar"
      className={sidebarClassName}
      aria-label="PhotoManager 主导航"
    >
      <div className="sidebar__brand-row">
        <div className="sidebar__brand" aria-label="PhotoManager">
          <span className="sidebar__brand-mark" aria-hidden="true">
            <Camera size={20} />
          </span>
          <span className="sidebar__brand-name sidebar__label">PhotoManager</span>
        </div>

        <div className="sidebar__brand-actions">
          <button
            type="button"
            className="sidebar__icon-button sidebar__workspace-switch"
            onClick={onSwitchWorkspace}
            aria-label="切换工作区"
            title="返回选择工作区"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
          {isOverlay && (
            <button
              type="button"
              className="sidebar__icon-button sidebar__overlay-close"
              onClick={() => onToggleMode?.("collapsed")}
              aria-label="关闭侧边栏"
              title="关闭侧边栏"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar__context sidebar__label">
        <strong title={resolvedTitle}>{resolvedTitle}</strong>
        <span title={workspace?.path}>{workspace?.name ?? "当前工作区"}</span>
      </div>

      <nav className="sidebar__nav" aria-label="照片库">
        {NAVIGATION_ITEMS.map(({ id, label, Icon }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              type="button"
              className={`sidebar__nav-button${isActive ? " is-active" : ""}`}
              onClick={() => onNavigate?.(id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={label}
              title={label}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="sidebar__label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__divider" />

      <section
        className="sidebar__albums"
        aria-labelledby="sidebar-albums-heading"
      >
        <div className="sidebar__section-heading">
          <span
            id="sidebar-albums-heading"
            className="sidebar__section-title sidebar__label"
          >
            快捷相册
          </span>
          <div className="sidebar__section-actions">
            <button
              type="button"
              className="sidebar__icon-button"
              onClick={onCreateAlbum}
              aria-label="新建相册"
              title="新建相册"
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sidebar__icon-button sidebar__collapse-button"
              onClick={() =>
                onToggleMode?.(isCollapsed ? "expanded" : "collapsed")
              }
              aria-label={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
              aria-expanded={!isCollapsed}
              aria-controls="primary-sidebar"
              title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            >
              {isCollapsed ? (
                <ChevronRight size={17} aria-hidden="true" />
              ) : (
                <ChevronLeft size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <ul className="sidebar__album-list">
          {albums.map((album) => {
            const isActive =
              currentView === "album" && activeAlbumId === album.id;
            return (
              <li key={album.id}>
                <button
                  type="button"
                  className={`sidebar__album-button${isActive ? " is-active" : ""}`}
                  onClick={() => onOpenAlbum?.(album)}
                  aria-current={isActive ? "page" : undefined}
                  title={album.name}
                >
                  <Folder size={16} aria-hidden="true" />
                  <span className="sidebar__album-name">{album.name}</span>
                  <span
                    className="sidebar__album-count"
                    aria-label={`${album.photoCount || 0} 张照片`}
                  >
                    {album.photoCount || 0}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sidebar__footer">
        <button
          type="button"
          className={`sidebar__import-button${detectedCard ? " has-card" : ""}`}
          onClick={onImport}
          aria-label={importDescription}
          title={importDescription}
        >
          {detectedCard ? (
            <HardDriveDownload size={18} aria-hidden="true" />
          ) : (
            <Import size={18} aria-hidden="true" />
          )}
          <span className="sidebar__label">{importLabel}</span>
          {detectedCard && (
            <span className="sidebar__status-dot" aria-hidden="true" />
          )}
        </button>

        {onShowWorkspaceInfo && (
          <button
            type="button"
            className="sidebar__info-button"
            onClick={onShowWorkspaceInfo}
            aria-label="工作区信息"
            title="工作区信息"
          >
            <Info size={17} aria-hidden="true" />
            <span className="sidebar__label">工作区信息</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
