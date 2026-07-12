import { Download, LoaderCircle } from "lucide-react";

import styles from "./ImportControls.module.css";

function percent(copied, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCopied = Math.max(0, Number(copied) || 0);
  if (safeTotal === 0) return 0;
  return Math.min(100, (safeCopied / safeTotal) * 100);
}

export default function ImportProgressOverlay({
  open = false,
  copied = 0,
  total = 0,
  currentFile = "准备导入中…",
  title = "正在拷入并分析照片",
}) {
  if (!open) return null;

  const progress = percent(copied, total);

  return (
    <div className={styles.progressBackdrop} role="dialog" aria-modal="true" aria-label="照片导入进度">
      <div className={styles.progressCard} aria-live="polite" aria-busy="true">
        <span className={styles.progressIcon}>
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
        </span>
        <div className={styles.progressBody}>
          <div className={styles.progressHeading}>
            <span><Download aria-hidden="true" />{title}</span>
            <strong>{copied} / {total}</strong>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Number(total) || 0)}
            aria-valuenow={Math.max(0, Number(copied) || 0)}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p title={currentFile}>正在拷贝：{currentFile}</p>
        </div>
      </div>
    </div>
  );
}
