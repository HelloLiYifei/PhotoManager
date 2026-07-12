import { Brush, FolderPlus } from "lucide-react";

import styles from "./ImportControls.module.css";

function brushColor(album, getAlbumColor) {
  return album.color || getAlbumColor?.(album.name, album) || "#4f8cff";
}

export default function AlbumBrushPanel({
  albums = [],
  activeAlbum = null,
  disabled = false,
  getAlbumColor,
  onBrushChange,
  onCreateAlbum,
}) {
  return (
    <section className={`${styles.section} ${styles.growingSection}`} aria-labelledby="album-brush-heading">
      <div className={styles.sectionHeadingRow}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon}><Brush aria-hidden="true" /></span>
          <div>
            <h3 id="album-brush-heading">相册染色刷</h3>
            <p>选择相册后点击或拖过照片完成分类。</p>
          </div>
        </div>
        <button type="button" className={styles.iconTextButton} onClick={onCreateAlbum} disabled={disabled}>
          <FolderPlus aria-hidden="true" />
          新建
        </button>
      </div>

      <p className={styles.helpText}>
        新照片默认分配到“默认相册”；再次使用默认相册刷过照片可取消导入。
      </p>

      <div className={styles.brushList} role="listbox" aria-label="选择相册染色刷">
        {albums.length === 0 ? (
          <p className={styles.mutedStatus}>暂无可用相册。</p>
        ) : albums.map((album) => {
          const active = activeAlbum === album.name;
          const color = brushColor(album, getAlbumColor);

          return (
            <button
              type="button"
              key={album.id ?? album.name}
              className={`${styles.brushChoice} ${active ? styles.activeBrush : ""}`}
              style={{ "--brush-color": color }}
              onClick={() => onBrushChange?.(active ? null : album.name, album)}
              disabled={disabled}
              role="option"
              aria-selected={active}
            >
              <span className={styles.brushName}>
                <span className={styles.colorDot} aria-hidden="true" />
                {album.name}
              </span>
              {active ? <small><Brush aria-hidden="true" />刷子激活</small> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
