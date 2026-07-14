import { useId } from "react";
import { Crosshair, FolderOpen, LoaderCircle, Settings2 } from "lucide-react";

import styles from "./ImportControls.module.css";

const LOCATION_LABELS = {
  idle: "将在导入时获取",
  locating: "正在获取位置…",
  ready: "已获取当前位置",
  error: "位置不可用",
};

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
  const backupPathId = useId();
  const latitude = Number(currentLocation?.latitude);
  const longitude = Number(currentLocation?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  return (
    <section className={styles.section} aria-labelledby="import-options-heading">
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><Settings2 aria-hidden="true" /></span>
        <div>
          <h3 id="import-options-heading">导入选项</h3>
        </div>
      </div>

      <label className={styles.switchRow}>
        <span>
          <strong>补充当前位置</strong>
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
            <strong>{LOCATION_LABELS[locationStatus] || LOCATION_LABELS.idle}</strong>
            {hasCoordinates ? <small>{latitude.toFixed(5)}, {longitude.toFixed(5)}</small> : null}
            {locationError ? <small>{locationError}</small> : null}
          </span>
          {onRequestLocation ? (
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={disabled || locationStatus === "locating"}
            >
              {locationStatus === "ready" ? "刷新" : "立即获取"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor={backupPathId}>备份目录（可选）</label>
        <div className={styles.inputActionRow}>
          <input
            id={backupPathId}
            type="text"
            value={backupPath}
            onChange={(event) => onBackupPathChange?.(event.target.value)}
            placeholder="导入时自动同步到此路径"
            disabled={disabled}
            autoComplete="off"
          />
          <button type="button" onClick={onBrowseBackup} disabled={disabled}>
            <FolderOpen aria-hidden="true" />
            浏览
          </button>
        </div>
      </div>
    </section>
  );
}
