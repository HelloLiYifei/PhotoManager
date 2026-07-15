import { useId } from "react";
import {
  FolderOpen,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
} from "lucide-react";

import { useI18n } from "../../../i18n";
import { importControlsStyles as styles } from "../../../themes/classNames";

export default function SourceConfig({
  sourcePath = "",
  cards = [],
  scanning = false,
  detectingCards = false,
  scannedCount = null,
  scanError = "",
  disabled = false,
  onSourcePathChange,
  onScanSource,
  onBrowse,
  onSelectCard,
  onDetectCards,
}) {
  const { formatNumber, t } = useI18n();
  const controlsDisabled = disabled || scanning;
  const sourcePathId = useId();
  const hasScannedCount =
    scannedCount !== null &&
    scannedCount !== undefined &&
    Number.isFinite(Number(scannedCount));

  return (
    <section className={styles.section} aria-labelledby="import-source-heading">
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><FolderOpen aria-hidden="true" /></span>
        <div>
          <h3 id="import-source-heading">{t("import.chooseSource")}</h3>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={sourcePathId}>{t("import.sourcePath")}</label>
        <form
          className={styles.inputActionRow}
          onSubmit={(event) => {
            event.preventDefault();
            const nextPath = sourcePath.trim();
            if (nextPath) onScanSource?.(nextPath);
          }}
        >
          <input
            id={sourcePathId}
            type="text"
            value={sourcePath}
            onChange={(event) => onSourcePathChange?.(event.target.value)}
            placeholder={t("import.sourcePathPlaceholder")}
            disabled={controlsDisabled}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={controlsDisabled || !sourcePath.trim()}
            aria-label={t("import.scanSourcePath")}
            title={t("import.scanSourcePath")}
          >
            <ScanSearch aria-hidden="true" />
          </button>
          <button type="button" onClick={onBrowse} disabled={controlsDisabled}>
            <FolderOpen aria-hidden="true" />
            {t("common.browse")}
          </button>
        </form>
      </div>

      <div className={styles.subheadingRow}>
        <span>{t("import.connectedStorage")}</span>
        {onDetectCards ? (
          <button
            type="button"
            className={styles.textButton}
            onClick={onDetectCards}
            disabled={disabled || detectingCards || scanning}
          >
            {detectingCards ? (
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {t("import.detectDevices")}
          </button>
        ) : null}
      </div>

      {detectingCards ? (
        <p className={styles.mutedStatus} role="status">{t("import.detectingCards")}</p>
      ) : cards.length > 0 ? (
        <div className={styles.choiceList} aria-label={t("import.detectedStorage")}>
          {cards.map((card) => (
            <button
              type="button"
              key={card.path}
              className={sourcePath === card.path ? styles.activeChoice : undefined}
              onClick={() => onSelectCard?.(card.path, card)}
              disabled={controlsDisabled}
              aria-pressed={sourcePath === card.path}
            >
              <HardDrive aria-hidden="true" />
              <span>
                <strong>{card.label || t("import.removableDisk")}</strong>
                <small>{card.driveLetter ? `[${card.driveLetter}] ` : ""}{card.path}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.mutedStatus}>{t("import.noExternalStorage")}</p>
      )}

      <div
        className={`${styles.scanStatus} ${scanError ? styles.errorStatus : ""}`}
        role={scanError ? "alert" : "status"}
      >
        {scanning ? (
          <>
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
            <span><strong>{t("import.scanningPhotos")}</strong><small>{t("import.readingSource")}</small></span>
          </>
        ) : scanError ? (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>{t("import.scanFailed")}</strong><small>{scanError}</small></span>
          </>
        ) : hasScannedCount ? (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>{t("import.scanComplete")}</strong><small>{t("import.photosFound", { count: formatNumber(scannedCount) })}</small></span>
          </>
        ) : (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>{t("import.awaitingSource")}</strong><small>{t("import.enterPathOrDevice")}</small></span>
          </>
        )}
      </div>
    </section>
  );
}
