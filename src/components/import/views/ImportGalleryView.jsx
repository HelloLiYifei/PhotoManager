import { useEffect, useRef } from "react";
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
}) {
  const galleryRef = useRef(null);
  const lastWheelTimeRef = useRef(0);
  const activeIndex = findPhotoIndex(photos, activePath);
  const photo = photos[activeIndex];

  useEffect(() => {
    galleryRef.current?.focus();
  }, []);

  if (!photo) {
    return <div className={styles.empty} role="status">暂无可预览照片</div>;
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
      aria-label="导入照片画廊"
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
        <div className={styles.galleryMedia} role="group" aria-label="当前导入照片预览">
          {activeIndex > 0 && (
            <button
              type="button"
              className={`${styles.galleryNav} ${styles.previous}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => activateIndex(activeIndex - 1)}
              aria-label="上一张"
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
              onClick={() => activateIndex(activeIndex + 1)}
              aria-label="下一张"
            >
              ›
            </button>
          )}
        </div>

        <div className={styles.galleryCaption}>
          <strong>{photo.relativePath}</strong>
          <span>{photo.dateTaken || "日期未知"} · {formatImportFileSize(photo.size)}</span>
        </div>
      </div>

      <div className={styles.filmstrip} role="listbox" aria-label="存储卡照片胶片带">
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
              title={filmPhoto.relativePath}
            >
              <ImportThumbnail photo={filmPhoto} scrollRoot={scrollRoot} fit="cover" />
              {filmPhoto.alreadyImported && (
                <span className={`${styles.filmStatus} ${styles.importedFilmStatus}`}>已导入</span>
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
