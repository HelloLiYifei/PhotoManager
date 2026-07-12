import { ThumbnailImage } from "../media";
import { handlePhotoItemKeyDown } from "./photoItemKeyboard";
import styles from "./PhotoViews.module.css";

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
  return (
    <div className="finder-list" role="table" aria-label="照片列表">
      <div className="finder-list-header" role="row">
        <span role="columnheader">名称</span>
        <span role="columnheader">拍摄日期</span>
        <span role="columnheader">类型</span>
        <span role="columnheader">大小</span>
        <span role="columnheader">尺寸</span>
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
