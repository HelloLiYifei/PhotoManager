import { useEffect, useRef } from "react";
import { GalleryPreviewImage, ThumbnailImage } from "../media";
import { handlePhotoItemKeyDown } from "./photoItemKeyboard";
import styles from "./PhotoViews.module.css";

function photoIndex(photos, photo) {
  if (!photo) return -1;
  return photos.findIndex((item) => item.id === photo.id);
}

export default function GalleryView({
  photos,
  activePhoto,
  selectedIds = [],
  scrollRoot,
  actionToolbar = null,
  onSelect,
  onOpen,
}) {
  const galleryRef = useRef(null);
  const lastWheelTimeRef = useRef(0);
  const activeIndex = Math.max(0, photoIndex(photos, activePhoto));
  const currentPhoto = photos[activeIndex];

  useEffect(() => {
    galleryRef.current?.focus();
  }, []);

  if (!currentPhoto) return null;

  const selectIndex = (nextIndex, event) => {
    const boundedIndex = Math.max(0, Math.min(photos.length - 1, nextIndex));
    if (boundedIndex === activeIndex) return;
    onSelect?.(photos[boundedIndex], event);
  };

  const handleGalleryKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectIndex(activeIndex - 1, event);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectIndex(activeIndex + 1, event);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectIndex(0, event);
    } else if (event.key === "End") {
      event.preventDefault();
      selectIndex(photos.length - 1, event);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onOpen?.(photos, activeIndex);
    } else if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      onSelect?.(currentPhoto, event);
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
    selectIndex(activeIndex + (delta > 0 ? 1 : -1), event);
  };

  return (
    <div
      ref={galleryRef}
      className={`finder-gallery ${actionToolbar ? "has-action-toolbar" : ""}`}
      tabIndex={0}
      aria-label="画廊照片预览"
      onKeyDown={handleGalleryKeyDown}
    >
      <div
        className="finder-gallery-stage"
        onWheel={handleWheel}
      >
        <div
          className="finder-gallery-media"
          onDoubleClick={() => onOpen?.(photos, activeIndex)}
        >
          {activeIndex > 0 && (
            <button
              type="button"
              className="gallery-stage-nav prev"
              onClick={(event) => selectIndex(activeIndex - 1, event)}
              aria-label="上一张"
            >
              ‹
            </button>
          )}

          <GalleryPreviewImage id={currentPhoto.id} alt={currentPhoto.filename} />

          {activeIndex < photos.length - 1 && (
            <button
              type="button"
              className="gallery-stage-nav next"
              onClick={(event) => selectIndex(activeIndex + 1, event)}
              aria-label="下一张"
            >
              ›
            </button>
          )}
        </div>

        <div className="finder-gallery-caption">
          <strong>{currentPhoto.filename}</strong>
          {actionToolbar ? (
            <div className="finder-gallery-actions">{actionToolbar}</div>
          ) : <span aria-hidden="true" />}
          <span>
            {currentPhoto.dateTaken || "日期未知"} · {formatFileSize(currentPhoto.fileSize)}
          </span>
        </div>
      </div>

      <div className="finder-gallery-filmstrip" role="listbox" aria-label="照片胶片带">
        {photos.map((photo, index) => {
          const isActive = currentPhoto.id === photo.id;
          const isSelected = selectedIds.includes(photo.id);

          return (
            <div
              key={photo.id}
              className={`finder-gallery-film ${styles.filmItem} ${isActive ? "active" : ""}`}
              role="option"
              tabIndex={0}
              aria-label={photo.filename}
              aria-current={isActive ? "true" : undefined}
              aria-selected={isSelected}
              onClick={(event) => {
                if (event.detail < 2) onSelect?.(photo, event);
              }}
              onDoubleClick={() => onOpen?.(photos, index)}
              onKeyDown={(event) => {
                event.stopPropagation();
                handlePhotoItemKeyDown({
                  event,
                  photo,
                  photos,
                  index,
                  onSelect,
                  onOpen,
                });
              }}
              title={photo.filename}
            >
              <ThumbnailImage
                id={photo.id}
                alt={photo.filename}
                scrollRoot={scrollRoot}
                fit="cover"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  const megabytes = Number(bytes || 0) / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
}
