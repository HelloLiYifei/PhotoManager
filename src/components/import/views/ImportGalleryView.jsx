import { useEffect, useRef } from "react";
import { useI18n } from "../../../i18n";
import {
  ImportGalleryPreview,
  ImportPhotoMarkers,
  ImportThumbnail,
} from "./ImportViewShared";
import {
  formatImportFileSize,
  getImportPhotoState,
  getImportPhotoStyle,
  handleImportPhotoMouseDown,
  handleImportPhotoMouseEnter,
} from "./importViewUtils";
import styles from "./ImportViews.module.css";

function findPhotoIndex(photos, activePath) {
  const index = photos.findIndex((photo) => photo.absolutePath === activePath);
  return index < 0 ? 0 : index;
}

export default function ImportGalleryView({
  photos = [],
  activePath = null,
  scrollRoot,
  brushAlbum = null,
  getPhotoVisualState,
  onActivatePhoto,
  onBrushPhoto,
  onBrushEnter,
  onOpenPhoto,
}) {
  const { t } = useI18n();
  const galleryRef = useRef(null);
  const lastWheelTimeRef = useRef(0);
  const activeIndex = findPhotoIndex(photos, activePath);
  const photo = photos[activeIndex];

  useEffect(() => {
    galleryRef.current?.focus();
  }, []);

  if (!photo) {
    return <div className={styles.empty} role="status">{t("import.noPreviewPhotos")}</div>;
  }

  const state = getImportPhotoState(photo, getPhotoVisualState);

  const activateIndex = (nextIndex) => {
    const boundedIndex = Math.max(0, Math.min(photos.length - 1, nextIndex));
    if (boundedIndex !== activeIndex) onActivatePhoto?.(photos[boundedIndex]);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateIndex(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      activateIndex(activeIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      activateIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      activateIndex(photos.length - 1);
    } else if (
      (event.key === "Enter" || event.key === " " || event.key === "Spacebar")
      && brushAlbum
      && !photo.alreadyImported
    ) {
      event.preventDefault();
      onBrushPhoto?.(photo, event);
    }
  };

  const handleWheel = (event) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 180) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
    if (Math.abs(delta) < 8) return;
    event.preventDefault();
    lastWheelTimeRef.current = now;
    activateIndex(activeIndex + (delta > 0 ? 1 : -1));
  };

  return (
    <div
      ref={galleryRef}
      className={styles.gallery}
      role="region"
      tabIndex={0}
      aria-label={t("import.photoGallery")}
      onKeyDown={handleKeyDown}
    >
      <div
        className={[
          styles.galleryStage,
          state.isFocused ? styles.focused : "",
          photo.alreadyImported ? styles.alreadyImported : "",
        ].filter(Boolean).join(" ")}
        style={getImportPhotoStyle(photo, state)}
        aria-label={photo.relativePath}
        aria-selected={state.isFocused}
        aria-disabled={photo.alreadyImported || undefined}
        onMouseDown={(event) => handleImportPhotoMouseDown({
          event,
          photo,
          brushAlbum,
          onActivatePhoto,
          onBrushPhoto,
        })}
        onWheel={handleWheel}
      >
        <div
          className={styles.galleryMedia}
          role="group"
          aria-label={t("import.currentPhotoPreview")}
          onDoubleClick={() => {
            if (!brushAlbum) onOpenPhoto?.(photo);
          }}
        >
          {activeIndex > 0 && (
            <button
              type="button"
              className={`${styles.galleryNav} ${styles.previous}`}
              onMouseDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={() => activateIndex(activeIndex - 1)}
              aria-label={t("lightbox.previous")}
            >
              ‹
            </button>
          )}

          <ImportGalleryPreview photo={photo} />
          <ImportPhotoMarkers photo={photo} state={state} />

          {activeIndex < photos.length - 1 && (
            <button
              type="button"
              className={`${styles.galleryNav} ${styles.next}`}
              onMouseDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={() => activateIndex(activeIndex + 1)}
              aria-label={t("lightbox.next")}
            >
              ›
            </button>
          )}
        </div>

        <div className={styles.galleryCaption}>
          <strong>{photo.relativePath}</strong>
          <span>{photo.dateTaken || t("import.dateUnknown")} · {formatImportFileSize(photo.size)}</span>
        </div>
      </div>

      <div className={styles.filmstrip} role="listbox" aria-label={t("import.cardFilmstrip")}>
        {photos.map((filmPhoto) => {
          const filmState = getImportPhotoState(filmPhoto, getPhotoVisualState);
          const isActive = filmPhoto.absolutePath === photo.absolutePath;
          return (
            <button
              type="button"
              role="option"
              key={filmPhoto.absolutePath}
              className={[
                styles.film,
                isActive ? styles.activeFilm : "",
                filmState.isChecked ? styles.selected : "",
                filmPhoto.alreadyImported ? styles.alreadyImported : "",
              ].filter(Boolean).join(" ")}
              style={getImportPhotoStyle(filmPhoto, filmState)}
              aria-label={filmPhoto.relativePath}
              aria-current={isActive ? "true" : undefined}
              aria-selected={filmState.isFocused}
              aria-disabled={filmPhoto.alreadyImported || undefined}
              onMouseDown={(event) => handleImportPhotoMouseDown({
                event,
                photo: filmPhoto,
                brushAlbum,
                onActivatePhoto,
                onBrushPhoto,
              })}
              onMouseEnter={(event) => handleImportPhotoMouseEnter({
                event,
                photo: filmPhoto,
                brushAlbum,
                onBrushEnter,
              })}
              onDoubleClick={() => {
                if (!brushAlbum) onOpenPhoto?.(filmPhoto);
              }}
              title={filmPhoto.relativePath}
            >
              <ImportThumbnail photo={filmPhoto} scrollRoot={scrollRoot} fit="cover" />
              {filmPhoto.alreadyImported && (
                <span className={`${styles.filmStatus} ${styles.importedFilmStatus}`}>{t("import.imported")}</span>
              )}
              {!filmPhoto.alreadyImported && filmState.targetAlbum && (
                <span
                  className={styles.filmStatus}
                  style={{ backgroundColor: filmState.albumColor }}
                >
                  {filmState.targetAlbum}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
