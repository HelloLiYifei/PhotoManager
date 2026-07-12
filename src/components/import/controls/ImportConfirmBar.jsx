import { Brush, Download, Eraser } from "lucide-react";

import styles from "./ImportControls.module.css";

export default function ImportConfirmBar({
  selectedCount = 0,
  totalCount = 0,
  importedCount = 0,
  activeBrush = "默认相册",
  brushColor = "#4f8cff",
  importing = false,
  scanning = false,
  disabled = false,
  onColorAll,
  onClearColors,
  onImport,
}) {
  const importDisabled = disabled || importing || scanning || selectedCount === 0;

  return (
    <section className={styles.confirmBar} aria-label="确认导入">
      <div className={styles.confirmStats} role="status">
        <strong>{selectedCount} 张待导入</strong>
        <span>共 {totalCount} 张{importedCount ? `，${importedCount} 张已导入` : ""}</span>
      </div>

      <div className={styles.confirmShortcuts} role="toolbar" aria-label="染色快捷操作">
        <button
          type="button"
          onClick={onColorAll}
          disabled={disabled || scanning || totalCount - importedCount <= 0}
          style={{ "--brush-color": brushColor }}
        >
          <span className={styles.colorDot} aria-hidden="true" />
          <Brush aria-hidden="true" />
          全部染为“{activeBrush || "默认相册"}”
        </button>
        <button
          type="button"
          onClick={onClearColors}
          disabled={disabled || scanning || selectedCount === 0}
        >
          <Eraser aria-hidden="true" />
          全部取消
        </button>
      </div>

      <button
        type="button"
        className={styles.importButton}
        onClick={onImport}
        disabled={importDisabled}
      >
        <Download aria-hidden="true" />
        {importing ? "正在导入…" : `开始导入 ${selectedCount} 张`}
      </button>
    </section>
  );
}
