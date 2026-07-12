import { useId } from "react";
import {
  FolderOpen,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
} from "lucide-react";

import styles from "./ImportControls.module.css";

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
          <h3 id="import-source-heading">选择导入源</h3>
          <p>选择相机存储卡或本地文件夹。</p>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={sourcePathId}>来源路径</label>
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
            placeholder="导入来源文件夹路径"
            disabled={controlsDisabled}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={controlsDisabled || !sourcePath.trim()}
            aria-label="扫描来源路径"
            title="扫描来源路径"
          >
            <ScanSearch aria-hidden="true" />
          </button>
          <button type="button" onClick={onBrowse} disabled={controlsDisabled}>
            <FolderOpen aria-hidden="true" />
            浏览
          </button>
        </form>
      </div>

      <div className={styles.subheadingRow}>
        <span>已连接的外部存储</span>
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
            检测设备
          </button>
        ) : null}
      </div>

      {detectingCards ? (
        <p className={styles.mutedStatus} role="status">正在检测存储卡…</p>
      ) : cards.length > 0 ? (
        <div className={styles.choiceList} aria-label="检测到的外部存储">
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
                <strong>{card.label || "移动磁盘"}</strong>
                <small>{card.driveLetter ? `[${card.driveLetter}] ` : ""}{card.path}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.mutedStatus}>暂未检测到外部存储。</p>
      )}

      <div
        className={`${styles.scanStatus} ${scanError ? styles.errorStatus : ""}`}
        role={scanError ? "alert" : "status"}
      >
        {scanning ? (
          <>
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
            <span><strong>正在扫描照片</strong><small>正在读取来源目录中的照片树…</small></span>
          </>
        ) : scanError ? (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>扫描失败</strong><small>{scanError}</small></span>
          </>
        ) : hasScannedCount ? (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>扫描完成</strong><small>发现 {Number(scannedCount)} 张照片</small></span>
          </>
        ) : (
          <>
            <ScanSearch aria-hidden="true" />
            <span><strong>等待选择来源</strong><small>输入路径后点击扫描，或选择存储设备。</small></span>
          </>
        )}
      </div>
    </section>
  );
}
