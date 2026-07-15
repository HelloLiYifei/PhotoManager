import { ThumbnailImage } from "../media";
import { useI18n } from "../../../i18n";
import { handlePhotoItemKeyDown } from "./photoItemKeyboard";
import { photoViewsStyles as styles } from "../../../themes/classNames";

function formatFileSize(bytes) {
  const megabytes = Number(bytes || 0) / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
}

export default function ListView({
  photos,
  selectedIds = [],
  scrollRoot,
  onSelect,
  onOpen,
}) {
  const { t } = useI18n();
  return (
    <div className="finder-list" role="table" aria-label={t("timeline.photoList")}>
      <div className="finder-list-header" role="row">
        <span role="columnheader">{t("photo.name")}</span>
        <span role="columnheader">{t("photo.dateTaken")}</span>
        <span role="columnheader">{t("import.type")}</span>
        <span role="columnheader">{t("import.size")}</span>
        <span role="columnheader">{t("photo.dimensions")}</span>
      </div>

      {photos.map((photo, index) => {
        const isSelected = selectedIds.includes(photo.id);

        return (
          <div
            key={photo.id}
            className={`finder-list-row ${styles.listRow} ${isSelected ? "selected" : ""}`}
            role="row"
            tabIndex={0}
            aria-label={photo.filename}
            aria-selected={isSelected}
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
            <span className="finder-list-name" role="cell">
              <span className="finder-list-thumb">
                <ThumbnailImage
                  id={photo.id}
                  alt=""
                  scrollRoot={scrollRoot}
                  fit="cover"
                />
              </span>
              <span title={photo.filename}>
                {photo.isFavorite && <span className={styles.favoritePrefix}>♥ </span>}
                {photo.filename}
              </span>
            </span>
            <span role="cell">{photo.dateTaken || "—"}</span>
            <span role="cell">{photo.fileType || "—"}</span>
            <span role="cell">{formatFileSize(photo.fileSize)}</span>
            <span role="cell">
              {photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
