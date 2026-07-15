import { useId, useRef } from "react";
import { X } from "lucide-react";

import { useI18n } from "../../i18n";
import Button from "./Button";
import useOverlayFocus from "./useOverlayFocus";
import { uiStyles as styles } from "../../themes/classNames";

export default function Drawer({
  open = false,
  onClose,
  title,
  description = "",
  side = "right",
  children,
  footer = null,
  closeDisabled = false,
  className = "",
}) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  useOverlayFocus({ open, containerRef: panelRef, onClose, closeDisabled });

  if (!open) return null;

  return (
    <div className={styles.drawerOverlay}>
      <button
        type="button"
        className={styles.drawerScrim}
        onClick={onClose}
        disabled={closeDisabled}
        aria-label={t("dialog.closeDrawer")}
      />
      <aside
        ref={panelRef}
        className={`${styles.drawer} ${styles[`drawer_${side}`] || styles.drawer_right} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className={styles.overlayHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={t("dialog.closeDrawer")}
          >
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer ? <footer className={styles.overlayFooter}>{footer}</footer> : null}
      </aside>
    </div>
  );
}
