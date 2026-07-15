import "./Shell.css";
import { useI18n } from "../../i18n";

const SIDEBAR_MODES = new Set(["expanded", "collapsed", "overlay"]);

function AppShell({
  sidebar,
  header,
  children,
  sidebarMode = "expanded",
  onRequestSidebarClose,
  contentId = "main-content",
  contentLabel = null,
  className = "",
}) {
  const { t } = useI18n();
  const resolvedContentLabel = contentLabel || t("nav.photoContent");
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
          aria-label={t("nav.closeSidebar")}
          onClick={onRequestSidebarClose}
        />
      )}

      <div className="app-shell__body">
        {header}
        <main
          id={contentId}
          className="app-shell__content"
          aria-label={resolvedContentLabel}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
