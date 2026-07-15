import { SlidersHorizontal, X } from "lucide-react";

import { useI18n } from "../../../i18n";
import { importControlsStyles as styles } from "../../../themes/classNames";

export default function ConfigurationPanel({
  open = false,
  title = null,
  description = null,
  disabled = false,
  children,
  onOpen,
  onClose,
}) {
  const { t } = useI18n();
  const resolvedTitle = title || t("import.configuration");
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
          {t("import.configuration")}
        </button>
      ) : null}

      {open ? (
        <button
          type="button"
          className={styles.configurationScrim}
          onClick={onClose}
          disabled={disabled}
          aria-label={t("import.closeConfiguration")}
        />
      ) : null}

      <aside className={styles.configurationPanel} aria-label={resolvedTitle}>
        <header className={styles.configurationHeader}>
          <div>
            <h2>{resolvedTitle}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={disabled} aria-label={t("import.closeConfigurationPanel")}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.configurationContent}>{children}</div>
      </aside>
    </div>
  );
}
