import {
  Check,
  Heart,
  Info,
  Maximize2,
  Paintbrush,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { Button } from "../ui";
import styles from "./Lightbox.module.css";

function ImportColorMenu({ albums, targetAlbum, targetColor, disabled, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const chooseAlbum = (albumName) => {
    onChange?.(albumName);
    setOpen(false);
  };

  return (
    <div
      ref={menuRef}
      className={styles.colorMenu}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <Button
        variant={targetAlbum ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label={disabled ? t("import.alreadyImportedNoColor") : t("import.colorCurrentPhoto")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? t("import.duplicateColorDisabled") : undefined}
      >
        <span
          className={styles.colorSwatch}
          style={{ backgroundColor: targetAlbum ? targetColor : "transparent" }}
          aria-hidden="true"
        />
        <Paintbrush aria-hidden="true" />
        {disabled
          ? t("import.alreadyImportedNoColor")
          : targetAlbum
            ? t("import.colorAlbum", { name: targetAlbum })
            : t("import.color")}
      </Button>

      {open && !disabled && (
        <div className={styles.colorMenuPopup} role="menu" aria-label={t("import.chooseTargetAlbum")}>
          {albums.map((album) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={targetAlbum === album.name}
              className={styles.colorMenuItem}
              key={album.id || album.name}
              onClick={() => chooseAlbum(album.name)}
            >
              <span className={styles.colorSwatch} style={{ backgroundColor: album.color }} aria-hidden="true" />
              <span>{album.name}</span>
              {targetAlbum === album.name && <Check aria-hidden="true" />}
            </button>
          ))}
          {targetAlbum && (
            <>
              <span className={styles.colorMenuSeparator} aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className={`${styles.colorMenuItem} ${styles.clearColorItem}`}
                onClick={() => chooseAlbum(null)}
              >
                {t("import.clearColor")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function LightboxToolbar({
  zoom,
  pan,
  rating,
  favorite,
  isDeleted,
  detailsOpen,
  busy,
  onClose,
  onToggleDetails,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onRatingChange,
  onToggleFavorite,
  onDelete,
  onPermanentDelete,
  mode = "library",
  importAlbums = [],
  importTargetAlbum = null,
  importTargetColor = "transparent",
  importColorDisabled = false,
  onImportAlbumChange,
}) {
  const { t } = useI18n();
  const transformReset = zoom === 1 && pan.x === 0 && pan.y === 0;
  const isImportMode = mode === "import";

  return (
    <>
      <div className={styles.topActions} role="toolbar" aria-label={t("lightbox.windowActions")}>
        <Button
          variant={detailsOpen ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleDetails}
          aria-label={detailsOpen ? t("lightbox.closeInfo") : t("lightbox.openInfo")}
          aria-expanded={detailsOpen}
        >
          <Info aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("lightbox.closePreview")}>
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label={t("lightbox.quickActions")}>
        <div className={styles.toolbarGroup} role="group" aria-label={t("lightbox.zoom")}>
          <Button variant="ghost" size="icon" onClick={onZoomOut} disabled={zoom <= 0.25} aria-label={t("lightbox.zoomOut")}>
            <ZoomOut aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className={styles.zoomValue} onClick={onResetZoom} aria-label={t("lightbox.fitWindow")}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="ghost" size="icon" onClick={onZoomIn} disabled={zoom >= 8} aria-label={t("lightbox.zoomIn")}>
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onResetZoom} disabled={transformReset} aria-label={t("lightbox.resetPhoto")}>
            {transformReset ? <Maximize2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          </Button>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        {!isImportMode && <div className={styles.rating} role="group" aria-label={t("photo.rating")}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              key={star}
              variant="ghost"
              size="icon"
              className={star <= rating ? styles.starActive : styles.star}
              onClick={() => onRatingChange(star)}
              disabled={busy}
              aria-label={t("photo.rateStars", { count: star })}
              aria-pressed={star <= rating}
            >
              <Star aria-hidden="true" fill={star <= rating ? "currentColor" : "none"} />
            </Button>
          ))}
        </div>}

        {!isImportMode && <span className={styles.divider} aria-hidden="true" />}

        {!isImportMode && <Button
          variant={favorite ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleFavorite}
          disabled={busy}
          aria-pressed={favorite}
        >
          <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
          {favorite ? t("photo.liked") : t("photo.like")}
        </Button>}
        {!isImportMode && <Button
          variant={isDeleted ? "secondary" : "danger"}
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          {isDeleted ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {isDeleted ? t("common.restore") : t("photo.moveToTrash")}
        </Button>}
        {!isImportMode && isDeleted && (
          <Button variant="danger" size="sm" onClick={onPermanentDelete} disabled={busy}>
            {t("common.deletePermanently")}
          </Button>
        )}
        {isImportMode && (
          <ImportColorMenu
            albums={importAlbums}
            targetAlbum={importTargetAlbum}
            targetColor={importTargetColor}
            disabled={importColorDisabled}
            onChange={onImportAlbumChange}
          />
        )}
      </div>
    </>
  );
}
