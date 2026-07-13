import { useCallback, useEffect, useState } from "react";
import { loadPathThumbnail } from "../../../lib/thumbnailLoader";
import { loadPathPreview } from "../../../lib/previewLoader";
import { LazyThumbnail } from "../../timeline/media";
import styles from "./ImportViews.module.css";

export function ImportThumbnail({
  photo,
  scrollRoot,
  fit = "natural",
  aspectRatio,
  className = "",
}) {
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
      aspectRatio={aspectRatio}
      className={[styles.thumbnail, className].filter(Boolean).join(" ")}
    />
  );
}

export function ImportGalleryPreview({ photo }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");

    loadPathPreview(photo.absolutePath, Boolean(photo.isRaw))
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("/placeholder.svg");
      });

    return () => {
      active = false;
    };
  }, [photo.absolutePath, photo.isRaw]);

  if (!src) {
    return (
      <div className={styles.galleryPreviewLoading} role="status" aria-label="正在读取高清导入预览">
        正在读取高清预览…
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={photo.relativePath || "导入照片预览"}
      className={`${styles.thumbnail} ${styles.galleryPreview}`}
      decoding="async"
      data-fit="contain"
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
