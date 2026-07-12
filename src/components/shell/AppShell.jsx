import "./Shell.css";

const SIDEBAR_MODES = new Set(["expanded", "collapsed", "overlay"]);

function AppShell({
  sidebar,
  header,
  children,
  sidebarMode = "expanded",
  onRequestSidebarClose,
  contentId = "main-content",
  contentLabel = "照片内容",
  className = "",
}) {
  const resolvedMode = SIDEBAR_MODES.has(sidebarMode)
    ? sidebarMode
    : "expanded";
  const shellClassName = [
    "app-shell",
    `app-shell--${resolvedMode}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName} data-sidebar-mode={resolvedMode}>
      <div className="app-shell__sidebar-slot">{sidebar}</div>

      {resolvedMode === "overlay" && (
        <button
          type="button"
          className="app-shell__scrim"
          aria-label="关闭侧边栏"
          onClick={onRequestSidebarClose}
        />
      )}

      <div className="app-shell__body">
        {header}
        <main
          id={contentId}
          className="app-shell__content"
          aria-label={contentLabel}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
