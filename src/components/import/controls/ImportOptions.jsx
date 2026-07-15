import { useId } from "react";
import { Crosshair, FolderOpen, LoaderCircle, Settings2 } from "lucide-react";

import { useI18n } from "../../../i18n";
import styles from "./ImportControls.module.css";

export default function ImportOptions({
  attachCurrentLocation = false,
  locationStatus = "idle",
  currentLocation = null,
  locationError = "",
  backupPath = "",
  disabled = false,
  onAttachCurrentLocationChange,
  onRequestLocation,
  onBackupPathChange,
  onBrowseBackup,
}) {
  const { t } = useI18n();
  const backupPathId = useId();
  const latitude = Number(currentLocation?.latitude);
  const longitude = Number(currentLocation?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  return (
    <section className={styles.section} aria-labelledby="import-options-heading">
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><Settings2 aria-hidden="true" /></span>
        <div>
          <h3 id="import-options-heading">{t("import.options")}</h3>
        </div>
      </div>

      <label className={styles.switchRow}>
        <span>
          <strong>{t("import.attachLocation")}</strong>
        </span>
        <input
          type="checkbox"
          checked={attachCurrentLocation}
          onChange={(event) => onAttachCurrentLocationChange?.(event.target.checked)}
          disabled={disabled}
        />
      </label>

      {attachCurrentLocation ? (
        <div className={`${styles.locationStatus} ${styles[`location_${locationStatus}`] || ""}`} role="status">
          {locationStatus === "locating" ? (
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
          ) : (
            <Crosshair aria-hidden="true" />
          )}
          <span>
            <strong>{t(`import.location.${locationStatus}`)}</strong>
            {hasCoordinates ? <small>{latitude.toFixed(5)}, {longitude.toFixed(5)}</small> : null}
            {locationError ? <small>{locationError}</small> : null}
          </span>
          {onRequestLocation ? (
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={disabled || locationStatus === "locating"}
            >
              {locationStatus === "ready" ? t("common.refresh") : t("import.getLocationNow")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor={backupPathId}>{t("import.backupOptional")}</label>
        <div className={styles.inputActionRow}>
          <input
            id={backupPathId}
            type="text"
            value={backupPath}
            onChange={(event) => onBackupPathChange?.(event.target.value)}
            placeholder={t("import.backupPlaceholder")}
            disabled={disabled}
            autoComplete="off"
          />
          <button type="button" onClick={onBrowseBackup} disabled={disabled}>
            <FolderOpen aria-hidden="true" />
            {t("common.browse")}
          </button>
        </div>
      </div>
    </section>
  );
}
