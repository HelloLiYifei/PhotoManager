import {
  ImportPhotoMarkers,
  ImportThumbnail,
} from "./ImportViewShared";
import {
  getImportPhotoState,
  getImportPhotoStyle,
  handleImportPhotoKeyDown,
  handleImportPhotoMouseDown,
  handleImportPhotoMouseEnter,
} from "./importViewUtils";
import styles from "./ImportViews.module.css";

export default function ImportMasonryView({
  photos = [],
  scrollRoot,
  brushAlbum = null,
  getPhotoVisualState,
  onActivatePhoto,
  onBrushPhoto,
  onBrushEnter,
}) {
  if (photos.length === 0) {
    return <div className={styles.empty} role="status">暂无可预览照片</div>;
  }

  return (
    <div className={styles.masonry} role="grid" aria-label="导入照片瀑布流">
      {photos.map((photo) => {
        const state = getImportPhotoState(photo, getPhotoVisualState);
        return (
          <div
            key={photo.absolutePath}
            className={[
              styles.masonryCard,
              state.isChecked ? styles.selected : "",
              state.isFocused ? styles.focused : "",
              photo.alreadyImported ? styles.alreadyImported : "",
            ].filter(Boolean).join(" ")}
            style={getImportPhotoStyle(photo, state)}
            role="gridcell"
            tabIndex={0}
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
            onMouseEnter={(event) => handleImportPhotoMouseEnter({
              event,
              photo,
              brushAlbum,
              onBrushEnter,
            })}
            onKeyDown={(event) => handleImportPhotoKeyDown({
              event,
              photo,
              brushAlbum,
              onActivatePhoto,
              onBrushPhoto,
            })}
          >
            <ImportThumbnail photo={photo} scrollRoot={scrollRoot} />
            <ImportPhotoMarkers photo={photo} state={state} />
            <span className={styles.cardName} title={photo.relativePath}>
              {photo.relativePath}
            </span>
          </div>
        );
      })}
    </div>
  );
}
