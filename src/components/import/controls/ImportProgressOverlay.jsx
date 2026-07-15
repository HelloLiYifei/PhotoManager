import { Download, LoaderCircle } from "lucide-react";

import { useI18n } from "../../../i18n";
import { importControlsStyles as styles } from "../../../themes/classNames";

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
  currentFile = null,
  title = null,
}) {
  const { formatNumber, t } = useI18n();
  if (!open) return null;

  const progress = percent(copied, total);
  const resolvedCurrentFile = currentFile || t("import.preparing");
  const resolvedTitle = title || t("import.copyingAndAnalyzing");

  return (
    <div className={styles.progressBackdrop} role="dialog" aria-modal="true" aria-label={t("import.progress")}>
      <div className={styles.progressCard} aria-live="polite" aria-busy="true">
        <span className={styles.progressIcon}>
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
        </span>
        <div className={styles.progressBody}>
          <div className={styles.progressHeading}>
            <span><Download aria-hidden="true" />{resolvedTitle}</span>
            <strong>{formatNumber(copied)} / {formatNumber(total)}</strong>
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
          <p title={resolvedCurrentFile}>{t("import.copyingFile", { name: resolvedCurrentFile })}</p>
        </div>
      </div>
    </div>
  );
}
