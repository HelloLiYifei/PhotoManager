import {
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import "./Shell.css";

const TOGGLE_PRESENTATION = {
  expanded: {
    Icon: PanelLeftClose,
    label: "折叠侧边栏",
    expanded: true,
  },
  collapsed: {
    Icon: PanelLeftOpen,
    label: "展开侧边栏",
    expanded: false,
  },
  overlay: {
    Icon: X,
    label: "关闭侧边栏",
    expanded: true,
  },
};

function PageHeader({
  title,
  description,
  eyebrow,
  workspaceName,
  actions,
  sidebarMode = "expanded",
  onToggleSidebar,
  titleId = "page-title",
  className = "",
}) {
  const toggle = TOGGLE_PRESENTATION[sidebarMode] ?? TOGGLE_PRESENTATION.expanded;
  const ToggleIcon = toggle.Icon;
  const headerClassName = ["page-header", className].filter(Boolean).join(" ");

  return (
    <header className={headerClassName} aria-labelledby={titleId}>
      <div className="page-header__leading">
        {onToggleSidebar && (
          <button
            type="button"
            className="page-header__sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label={toggle.label}
            aria-expanded={toggle.expanded}
            aria-controls="primary-sidebar"
            title={toggle.label}
          >
            <ToggleIcon size={18} aria-hidden="true" />
          </button>
        )}

        <div className="page-header__copy">
          {eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}
          <div className="page-header__title-row">
            <h1 id={titleId} className="page-header__title">
              {title}
            </h1>
            {workspaceName && (
              <span className="page-header__workspace" title={workspaceName}>
                {workspaceName}
              </span>
            )}
          </div>
          {description && (
            <p className="page-header__description">{description}</p>
          )}
        </div>
      </div>

      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export default PageHeader;
