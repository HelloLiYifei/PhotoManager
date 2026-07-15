import { EyeOff, GalleryHorizontal, Grid3X3, List, Palette } from "lucide-react";

import { useI18n } from "../../../i18n";
import ViewSwitcher from "../../shared/ViewSwitcher";
import styles from "./ImportControls.module.css";

const IMPORT_VIEW_OPTIONS = [
  { value: "masonry", label: "瀑布流", Icon: Grid3X3 },
  { value: "list", label: "列表", Icon: List },
  { value: "gallery", label: "画廊", Icon: GalleryHorizontal },
];

export default function ImportPreviewToolbar({
  visibleCount = 0,
  totalCount = 0,
  selectedCount = 0,
  importedCount = 0,
  viewMode = "masonry",
  hideImported = false,
  hideColored = false,
  disabled = false,
  onViewModeChange,
  onHideImportedChange,
  onHideColoredChange,
}) {
  const { formatNumber, t } = useI18n();
  const localizedViewOptions = IMPORT_VIEW_OPTIONS.map((option) => ({
    ...option,
    label: t(`settings.view.${option.value}`),
  }));
  return (
    <header className={styles.previewToolbar} aria-label={t("import.previewToolbar")}>
      <div className={styles.previewStats} role="status">
        <strong>{t("import.visiblePhotos", { visible: formatNumber(visibleCount), total: formatNumber(totalCount) })}</strong>
        <span>{t("import.readyCount", { count: formatNumber(selectedCount) })}</span>
      </div>

      <div className={styles.previewControls}>
        <div className={styles.filterButtons} role="group" aria-label={t("import.previewFilters")}>
          <button
            type="button"
            className={hideImported ? styles.pressedButton : undefined}
            onClick={() => onHideImportedChange?.(!hideImported)}
            disabled={disabled || importedCount === 0}
            aria-pressed={hideImported}
          >
            <EyeOff aria-hidden="true" />
            {t("import.hideImported")} <small>{formatNumber(importedCount)}</small>
          </button>
          <button
            type="button"
            className={hideColored ? styles.pressedButton : undefined}
            onClick={() => onHideColoredChange?.(!hideColored)}
            disabled={disabled || selectedCount === 0}
            aria-pressed={hideColored}
          >
            <Palette aria-hidden="true" />
            {t("import.hideColored")} <small>{formatNumber(selectedCount)}</small>
          </button>
        </div>

        <ViewSwitcher
          value={viewMode}
          onChange={onViewModeChange}
          options={localizedViewOptions}
          ariaLabel={t("import.previewView")}
        />
      </div>
    </header>
  );
}

export { IMPORT_VIEW_OPTIONS };
