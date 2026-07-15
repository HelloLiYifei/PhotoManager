import { Brush, Download, Eraser } from "lucide-react";

import { DEFAULT_BRUSH_COLOR } from "../../../content/contentColors";
import { useI18n } from "../../../i18n";
import { importControlsStyles as styles } from "../../../themes/classNames";

export default function ImportConfirmBar({
  selectedCount = 0,
  totalCount = 0,
  importedCount = 0,
  activeBrush = "",
  brushColor = DEFAULT_BRUSH_COLOR,
  importing = false,
  scanning = false,
  disabled = false,
  onColorAll,
  onClearColors,
  onImport,
}) {
  const { formatNumber, t } = useI18n();
  const importDisabled = disabled || importing || scanning || selectedCount === 0;

  return (
    <section className={styles.confirmBar} aria-label={t("import.confirmImport")}>
      <div className={styles.confirmStats} role="status">
        <strong>{t("import.pendingCount", { count: formatNumber(selectedCount) })}</strong>
        <span>{t("import.totalCount", {
          count: formatNumber(totalCount),
          imported: importedCount ? t("import.importedSuffix", { count: formatNumber(importedCount) }) : "",
        })}</span>
      </div>

      <div className={styles.confirmShortcuts} role="toolbar" aria-label={t("import.colorShortcuts")}>
        <button
          type="button"
          onClick={onColorAll}
          disabled={disabled || scanning || totalCount - importedCount <= 0}
          style={{ "--brush-color": brushColor }}
        >
          <span className={styles.colorDot} aria-hidden="true" />
          <Brush aria-hidden="true" />
          {t("import.colorAll", { name: activeBrush || t("import.defaultAlbum") })}
        </button>
        <button
          type="button"
          onClick={onClearColors}
          disabled={disabled || scanning || selectedCount === 0}
        >
          <Eraser aria-hidden="true" />
          {t("import.clearAll")}
        </button>
      </div>

      <button
        type="button"
        className={styles.importButton}
        onClick={onImport}
        disabled={importDisabled}
      >
        <Download aria-hidden="true" />
        {importing ? t("import.importing") : t("import.startImport", { count: formatNumber(selectedCount) })}
      </button>
    </section>
  );
}
