import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { loadPathThumbnail } from "../../../lib/thumbnailLoader";
import { loadPathPreview } from "../../../lib/previewLoader";
import { LazyThumbnail } from "../../timeline/media";
import { importViewsStyles as styles } from "../../../themes/classNames";

export function ImportThumbnail({
  photo,
  scrollRoot,
  fit = "natural",
  aspectRatio,
  className = "",
}) {
  const { t } = useI18n();
  const load = useCallback(
    (priority) => loadPathThumbnail(photo.absolutePath, Boolean(photo.isRaw), priority),
    [photo.absolutePath, photo.isRaw],
  );

  return (
    <LazyThumbnail
      sourceKey={photo.absolutePath}
      load={load}
      alt={photo.relativePath || t("import.photoPreview")}
      scrollRoot={scrollRoot}
      fit={fit}
      aspectRatio={aspectRatio}
      className={[styles.thumbnail, className].filter(Boolean).join(" ")}
    />
  );
}

export function ImportGalleryPreview({ photo }) {
  const { t } = useI18n();
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
      <div className={styles.galleryPreviewLoading} role="status" aria-label={t("import.readingHdImportPreview")}>
        {t("import.readingHdPreview")}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={photo.relativePath || t("import.photoPreview")}
      className={`${styles.thumbnail} ${styles.galleryPreview}`}
      decoding="async"
      data-fit="contain"
    />
  );
}

export function ImportPhotoMarkers({ photo, state }) {
  const { t } = useI18n();
  return (
    <>
      {photo.alreadyImported && (
        <span className={styles.importedBadge}>{t("import.alreadyExists")}</span>
      )}
      {state.targetAlbum && (
        <span
          className={styles.albumOverlay}
          style={{ backgroundColor: state.albumColor }}
          title={t("import.importToAlbum", { name: state.targetAlbum })}
        >
          {t("import.albumMarker", { name: state.targetAlbum })}
        </span>
      )}
      {(photo.isRaw || state.hasHiddenRawCompanion) && (
        <span
          className={styles.rawBadge}
          title={state.hasHiddenRawCompanion ? t("import.hiddenRawCompanion") : undefined}
        >
          RAW
        </span>
      )}
    </>
  );
}

export function ImportHiddenRawBadge({ state }) {
  const { t } = useI18n();
  if (!state.hasHiddenRawCompanion) return null;
  return (
    <span className={styles.rawBadge} title={t("import.hiddenRawCompanion")}>
      RAW
    </span>
  );
}
