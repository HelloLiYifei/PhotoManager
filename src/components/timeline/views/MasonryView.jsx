import { ThumbnailImage } from "../media";
import { useI18n } from "../../../i18n";
import { handlePhotoItemKeyDown } from "./photoItemKeyboard";
import { photoViewsStyles as styles } from "../../../themes/classNames";

function getStableAspectRatio(photo) {
  const width = Number(photo.width);
  const height = Number(photo.height);
  return width > 0 && height > 0 ? `${width} / ${height}` : "4 / 3";
}

export default function MasonryView({
  photos,
  selectedIds = [],
  compareLockedId = null,
  scrollRoot,
  onSelect,
  onOpen,
}) {
  const { t } = useI18n();
  return (
    <div className="masonry-grid" role="grid" aria-label={t("timeline.masonryPhotos")}>
      {photos.map((photo, index) => {
        const isSelected = selectedIds.includes(photo.id);
        const isCompareBase = compareLockedId === photo.id;

        return (
          <div
            key={photo.id}
            className={[
              "masonry-item",
              styles.photoItem,
              isSelected ? "selected" : "",
              isCompareBase ? styles.compareBase : "",
            ].filter(Boolean).join(" ")}
            role="gridcell"
            tabIndex={0}
            aria-label={photo.filename}
            aria-selected={isSelected}
            data-compare-base={isCompareBase || undefined}
            onClick={(event) => {
              if (event.detail < 2) onSelect?.(photo, event);
            }}
            onDoubleClick={() => onOpen?.(photos, index)}
            onKeyDown={(event) => handlePhotoItemKeyDown({
              event,
              photo,
              photos,
              index,
              onSelect,
              onOpen,
            })}
          >
            <ThumbnailImage
              id={photo.id}
              alt={photo.filename}
              scrollRoot={scrollRoot}
              aspectRatio={getStableAspectRatio(photo)}
            />

            {photo.fileType && !["JPG", "JPEG"].includes(photo.fileType.toUpperCase()) && (
              <span className={`${styles.badge} ${styles.fileTypeBadge}`}>
                {photo.fileType}
              </span>
            )}

            {photo.isFavorite && (
              <span className={`${styles.badge} ${styles.favoriteBadge}`} aria-label={t("photo.favorited")}>
                ♥
              </span>
            )}

            <span className={`photo-card-overlay ${styles.overlay}`}>
              <strong className={styles.filename}>{photo.filename}</strong>
              {photo.rating > 0 && (
                <span className={styles.rating} aria-label={t("photo.stars", { count: photo.rating })}>
                  ★ {photo.rating}
                </span>
              )}
            </span>

            {isCompareBase && (
              <span className={styles.compareLabel}>{t("timeline.compareBaselineShort")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
