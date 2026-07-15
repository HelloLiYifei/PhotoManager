import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Folder,
  HardDriveDownload,
  Heart,
  Images,
  Import,
  LogOut,
  MapPinned,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "../../i18n";
import "./Shell.css";

const NAVIGATION_ITEMS = [
  { id: "albums", labelKey: "nav.albums", Icon: Images },
  { id: "favorites", labelKey: "nav.favorites", Icon: Heart },
  { id: "map", labelKey: "nav.map", Icon: MapPinned },
  { id: "trash", labelKey: "nav.trash", Icon: Trash2 },
];

function getCurrentTitle(currentView, activeAlbumId, albums, t) {
  if (currentView === "album") {
    const album = albums.find((item) => item.id === activeAlbumId);
    return album?.name ?? t("nav.albums");
  }

  return (
    (currentView === "settings"
      ? t("nav.settings")
      : t(NAVIGATION_ITEMS.find((item) => item.id === currentView)?.labelKey ?? "nav.albums"))
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
  onShowSettings,
  className = "",
}) {
  const { t } = useI18n();
  const isCollapsed = mode === "collapsed";
  const isOverlay = mode === "overlay";
  const resolvedTitle =
    currentTitle ?? getCurrentTitle(currentView, activeAlbumId, albums, t);
  const cardName = detectedCard?.label || detectedCard?.driveLetter;
  const importLabel = detectedCard ? t("nav.detectedCard") : t("nav.import");
  const importDescription = detectedCard
    ? t("nav.detectedCardDescription", { name: cardName ? ` ${cardName}` : "" })
    : t("nav.import");
  const sidebarClassName = ["sidebar", `sidebar--${mode}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      id="primary-sidebar"
      className={sidebarClassName}
      aria-label={t("nav.mainNavigation")}
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
            aria-label={t("nav.switchWorkspace")}
            title={t("nav.returnWorkspace")}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
          {isOverlay && (
            <button
              type="button"
              className="sidebar__icon-button sidebar__overlay-close"
              onClick={() => onToggleMode?.("collapsed")}
              aria-label={t("nav.closeSidebar")}
              title={t("nav.closeSidebar")}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar__context sidebar__label">
        <strong title={resolvedTitle}>{resolvedTitle}</strong>
        <span title={workspace?.path}>{workspace?.name ?? t("nav.workspace")}</span>
      </div>

      <nav className="sidebar__nav" aria-label={t("nav.photoLibrary")}>
        {NAVIGATION_ITEMS.map(({ id, labelKey, Icon }) => {
          const label = t(labelKey);
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
            {t("nav.quickAlbums")}
          </span>
          <div className="sidebar__section-actions">
            <button
              type="button"
              className="sidebar__icon-button"
              onClick={onCreateAlbum}
              aria-label={t("nav.createAlbum")}
              title={t("nav.createAlbum")}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sidebar__icon-button sidebar__collapse-button"
              onClick={() =>
                onToggleMode?.(isCollapsed ? "expanded" : "collapsed")
              }
              aria-label={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              aria-expanded={!isCollapsed}
              aria-controls="primary-sidebar"
              title={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
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
                    aria-label={t("common.photoCount", { count: album.photoCount || 0 })}
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

        {onShowSettings && (
          <button
            type="button"
            className={`sidebar__info-button${currentView === "settings" ? " is-active" : ""}`}
            onClick={onShowSettings}
            aria-label={t("nav.settings")}
            aria-current={currentView === "settings" ? "page" : undefined}
            title={t("nav.settings")}
          >
            <Settings size={17} aria-hidden="true" />
            <span className="sidebar__label">{t("nav.settings")}</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
