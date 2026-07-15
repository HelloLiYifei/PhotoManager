import { Brush, FolderPlus } from "lucide-react";

import { DEFAULT_BRUSH_COLOR } from "../../../content/contentColors";
import { useI18n } from "../../../i18n";
import { importControlsStyles as styles } from "../../../themes/classNames";

function brushColor(album, getAlbumColor) {
  return album.color || getAlbumColor?.(album.name, album) || DEFAULT_BRUSH_COLOR;
}

export default function AlbumBrushPanel({
  albums = [],
  activeAlbum = null,
  disabled = false,
  getAlbumColor,
  onBrushChange,
  onCreateAlbum,
}) {
  const { t } = useI18n();
  return (
    <section className={`${styles.section} ${styles.growingSection}`} aria-labelledby="album-brush-heading">
      <div className={styles.sectionHeadingRow}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon}><Brush aria-hidden="true" /></span>
          <div>
            <h3 id="album-brush-heading">{t("import.albumBrush")}</h3>
          </div>
        </div>
        <button type="button" className={styles.iconTextButton} onClick={onCreateAlbum} disabled={disabled}>
          <FolderPlus aria-hidden="true" />
          {t("common.create")}
        </button>
      </div>

      <p className={styles.compactHint}>
        {t("import.brushHint")}
      </p>

      <div className={styles.brushList} role="listbox" aria-label={t("import.chooseAlbumBrush")}>
        {albums.length === 0 ? (
          <p className={styles.mutedStatus}>{t("import.noAlbumsSentence")}</p>
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
              {active ? <small><Brush aria-hidden="true" />{t("import.brushActive")}</small> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
