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
import { Button } from "../ui";
import styles from "./Lightbox.module.css";

function ImportColorMenu({ albums, targetAlbum, targetColor, disabled, onChange }) {
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
        aria-label={disabled ? "已导入，不可染色" : "为当前照片染色"}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? "已导入的重复照片不可再次染色" : undefined}
      >
        <span
          className={styles.colorSwatch}
          style={{ backgroundColor: targetAlbum ? targetColor : "transparent" }}
          aria-hidden="true"
        />
        <Paintbrush aria-hidden="true" />
        {disabled ? "已导入，不可染色" : targetAlbum ? `染色 · ${targetAlbum}` : "染色"}
      </Button>

      {open && !disabled && (
        <div className={styles.colorMenuPopup} role="menu" aria-label="选择目标相册">
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
                取消染色
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
  const transformReset = zoom === 1 && pan.x === 0 && pan.y === 0;
  const isImportMode = mode === "import";

  return (
    <>
      <div className={styles.topActions} role="toolbar" aria-label="照片窗口操作">
        <Button
          variant={detailsOpen ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleDetails}
          aria-label={detailsOpen ? "关闭照片信息" : "打开照片信息"}
          aria-expanded={detailsOpen}
        >
          <Info aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭照片预览">
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label="照片编辑快捷操作">
        <div className={styles.toolbarGroup} role="group" aria-label="缩放">
          <Button variant="ghost" size="icon" onClick={onZoomOut} disabled={zoom <= 0.25} aria-label="缩小照片">
            <ZoomOut aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className={styles.zoomValue} onClick={onResetZoom} aria-label="恢复适合窗口">
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="ghost" size="icon" onClick={onZoomIn} disabled={zoom >= 8} aria-label="放大照片">
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onResetZoom} disabled={transformReset} aria-label="复位照片">
            {transformReset ? <Maximize2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          </Button>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        {!isImportMode && <div className={styles.rating} role="group" aria-label="照片评分">
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              key={star}
              variant="ghost"
              size="icon"
              className={star <= rating ? styles.starActive : styles.star}
              onClick={() => onRatingChange(star)}
              disabled={busy}
              aria-label={`评为 ${star} 星`}
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
          {favorite ? "已喜欢" : "喜欢"}
        </Button>}
        {!isImportMode && <Button
          variant={isDeleted ? "secondary" : "danger"}
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          {isDeleted ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {isDeleted ? "恢复" : "移入回收站"}
        </Button>}
        {!isImportMode && isDeleted && (
          <Button variant="danger" size="sm" onClick={onPermanentDelete} disabled={busy}>
            永久删除
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
