import { EyeOff, GalleryHorizontal, Grid3X3, List, Palette } from "lucide-react";

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
  return (
    <header className={styles.previewToolbar} aria-label="导入预览工具栏">
      <div className={styles.previewStats} role="status">
        <strong>显示 {visibleCount} / {totalCount} 张照片</strong>
        <span>已染色并准备导入 {selectedCount} 张</span>
      </div>

      <div className={styles.previewControls}>
        <div className={styles.filterButtons} role="group" aria-label="导入预览筛选">
          <button
            type="button"
            className={hideImported ? styles.pressedButton : undefined}
            onClick={() => onHideImportedChange?.(!hideImported)}
            disabled={disabled || importedCount === 0}
            aria-pressed={hideImported}
          >
            <EyeOff aria-hidden="true" />
            隐藏已导入 <small>{importedCount}</small>
          </button>
          <button
            type="button"
            className={hideColored ? styles.pressedButton : undefined}
            onClick={() => onHideColoredChange?.(!hideColored)}
            disabled={disabled || selectedCount === 0}
            aria-pressed={hideColored}
          >
            <Palette aria-hidden="true" />
            隐藏已染色 <small>{selectedCount}</small>
          </button>
        </div>

        <ViewSwitcher
          value={viewMode}
          onChange={onViewModeChange}
          options={IMPORT_VIEW_OPTIONS}
          ariaLabel="导入图片预览方式"
        />
      </div>
    </header>
  );
}

export { IMPORT_VIEW_OPTIONS };
