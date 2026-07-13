import { useId, useRef } from "react";
import { X } from "lucide-react";

import Button from "./Button";
import useOverlayFocus from "./useOverlayFocus";
import styles from "./Ui.module.css";

export default function Dialog({
  open = false,
  onClose,
  title,
  description = "",
  ariaLabel,
  children,
  footer = null,
  closeLabel = "关闭对话框",
  closeDisabled = false,
  className = "",
  panelClassName = "",
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  useOverlayFocus({ open, containerRef: panelRef, onClose, closeDisabled });

  if (!open) return null;

  return (
    <div
      className={`${styles.overlay} ${className}`.trim()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose?.();
      }}
    >
      <section
        ref={panelRef}
        className={`${styles.dialog} ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
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
            aria-label={closeLabel}
          >
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer ? <footer className={styles.overlayFooter}>{footer}</footer> : null}
      </section>
    </div>
  );
}
