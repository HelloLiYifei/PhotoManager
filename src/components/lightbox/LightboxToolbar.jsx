import {
  Heart,
  Info,
  Maximize2,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "../ui";
import styles from "./Lightbox.module.css";

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
}) {
  const transformReset = zoom === 1 && pan.x === 0 && pan.y === 0;

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

        <div className={styles.rating} role="group" aria-label="照片评分">
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
        </div>

        <span className={styles.divider} aria-hidden="true" />

        <Button
          variant={favorite ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleFavorite}
          disabled={busy}
          aria-pressed={favorite}
        >
          <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
          {favorite ? "已喜欢" : "喜欢"}
        </Button>
        <Button
          variant={isDeleted ? "secondary" : "danger"}
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          {isDeleted ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {isDeleted ? "恢复" : "移入回收站"}
        </Button>
        {isDeleted && (
          <Button variant="danger" size="sm" onClick={onPermanentDelete} disabled={busy}>
            永久删除
          </Button>
        )}
      </div>
    </>
  );
}
