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
  if (photos.length === 0) {
    return <div className={styles.empty} role="status">暂无可预览照片</div>;
  }

  return (
    <div className={styles.listScroller}>
      <div className={styles.list} role="table" aria-label="存储卡照片列表">
        <div className={`${styles.listGrid} ${styles.listHeader}`} role="row">
          <span role="columnheader">名称</span>
          <span role="columnheader">拍摄日期</span>
          <span role="columnheader">类型</span>
          <span role="columnheader">大小</span>
          <span role="columnheader">导入状态 / 相册</span>
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
                  <strong className={styles.importedText}>已导入</strong>
                ) : state.isChecked ? (
                  <strong style={{ color: state.albumColor }}>● {state.targetAlbum}</strong>
                ) : (
                  <strong className={styles.skippedText}>不导入</strong>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
