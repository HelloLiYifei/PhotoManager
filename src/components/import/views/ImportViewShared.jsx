import { useCallback } from "react";
import { loadPathThumbnail } from "../../../lib/thumbnailLoader";
import { LazyThumbnail } from "../../timeline/media";
import styles from "./ImportViews.module.css";

export function ImportThumbnail({ photo, scrollRoot, fit = "natural", className = "" }) {
  const load = useCallback(
    (priority) => loadPathThumbnail(photo.absolutePath, Boolean(photo.isRaw), priority),
    [photo.absolutePath, photo.isRaw],
  );

  return (
    <LazyThumbnail
      sourceKey={photo.absolutePath}
      load={load}
      alt={photo.relativePath || "导入照片预览"}
      scrollRoot={scrollRoot}
      fit={fit}
      className={[styles.thumbnail, className].filter(Boolean).join(" ")}
    />
  );
}

export function ImportPhotoMarkers({ photo, state }) {
  return (
    <>
      {photo.alreadyImported && (
        <span className={styles.importedBadge}>已存在</span>
      )}
      {state.targetAlbum && (
        <span
          className={styles.albumOverlay}
          style={{ backgroundColor: state.albumColor }}
          title={`导入到 ${state.targetAlbum}`}
        >
          相册 · {state.targetAlbum}
        </span>
      )}
      {photo.isRaw && <span className={styles.rawBadge}>RAW</span>}
    </>
  );
}
