import {
  ImportThumbnail,
} from "./ImportViewShared";
import {
  formatImportFileSize,
  getImportPhotoState,
  getImportPhotoStyle,
  handleImportPhotoKeyDown,
  handleImportPhotoMouseDown,
  handleImportPhotoMouseEnter,
  importFileType,
} from "./importViewUtils";
import { useI18n } from "../../../i18n";
import styles from "./ImportViews.module.css";

export default function ImportListView({
  photos = [],
  scrollRoot,
  brushAlbum = null,
  getPhotoVisualState,
  onActivatePhoto,
  onBrushPhoto,
  onBrushEnter,
  onOpenPhoto,
}) {
  const { t } = useI18n();
  if (photos.length === 0) {
    return <div className={styles.empty} role="status">{t("import.noPreviewPhotos")}</div>;
  }

  return (
    <div className={styles.listScroller}>
      <div className={styles.list} role="table" aria-label={t("import.cardPhotoList")}>
        <div className={`${styles.listGrid} ${styles.listHeader}`} role="row">
          <span role="columnheader">{t("photo.name")}</span>
          <span role="columnheader">{t("photo.dateTaken")}</span>
          <span role="columnheader">{t("import.type")}</span>
          <span role="columnheader">{t("import.size")}</span>
          <span role="columnheader">{t("import.statusAlbum")}</span>
        </div>

        {photos.map((photo) => {
          const state = getImportPhotoState(photo, getPhotoVisualState);
          return (
            <div
              key={photo.absolutePath}
              className={[
                styles.listGrid,
                styles.listRow,
                state.isChecked ? styles.selected : "",
                state.isFocused ? styles.focused : "",
                photo.alreadyImported ? styles.alreadyImported : "",
              ].filter(Boolean).join(" ")}
              style={getImportPhotoStyle(photo, state)}
              role="row"
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
              onDoubleClick={() => {
                if (!brushAlbum) onOpenPhoto?.(photo);
              }}
            >
              <span className={styles.listName} role="cell">
                <span className={styles.listThumb}>
                  <ImportThumbnail photo={photo} scrollRoot={scrollRoot} fit="cover" />
                </span>
                <span title={photo.relativePath}>{photo.relativePath}</span>
              </span>
              <span role="cell">{photo.dateTaken || "—"}</span>
              <span role="cell">{importFileType(photo)}</span>
              <span role="cell">{formatImportFileSize(photo.size)}</span>
              <span className={styles.listStatus} role="cell">
                {photo.alreadyImported ? (
                  <strong className={styles.importedText}>{t("import.imported")}</strong>
                ) : state.isChecked ? (
                  <strong style={{ color: state.albumColor }}>● {state.targetAlbum}</strong>
                ) : (
                  <strong className={styles.skippedText}>{t("import.skip")}</strong>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
