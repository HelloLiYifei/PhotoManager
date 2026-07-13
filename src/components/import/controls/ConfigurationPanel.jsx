import { SlidersHorizontal, X } from "lucide-react";

import styles from "./ImportControls.module.css";

export default function ConfigurationPanel({
  open = false,
  title = "导入配置",
  description = null,
  disabled = false,
  children,
  onOpen,
  onClose,
}) {
  return (
    <div className={`${styles.configurationRoot} ${open ? styles.configurationOpen : ""}`}>
      {!open ? (
        <button
          type="button"
          className={styles.configurationTrigger}
          onClick={onOpen}
          disabled={disabled}
          aria-expanded="false"
        >
          <SlidersHorizontal aria-hidden="true" />
          导入配置
        </button>
      ) : null}

      {open ? (
        <button
          type="button"
          className={styles.configurationScrim}
          onClick={onClose}
          disabled={disabled}
          aria-label="关闭导入配置"
        />
      ) : null}

      <aside className={styles.configurationPanel} aria-label={title}>
        <header className={styles.configurationHeader}>
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={disabled} aria-label="关闭导入配置面板">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.configurationContent}>{children}</div>
      </aside>
    </div>
  );
}
