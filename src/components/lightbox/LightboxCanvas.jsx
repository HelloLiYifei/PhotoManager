import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button, EmptyState, Spinner } from "../ui";
import { lightboxStyles as styles } from "../../themes/classNames";

export default function LightboxCanvas({
  photo,
  previewSrc,
  thumbnailSrc,
  loading,
  error,
  zoom,
  pan,
  isDragging,
  canGoPrevious,
  canGoNext,
  navigationDisabled,
  onPrevious,
  onNext,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onLoaded,
  onRetry,
}) {
  const { t } = useI18n();
  const transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;

  return (
    <section className={styles.canvasRegion} aria-label={t("lightbox.previewLabel", { name: photo.filename })}>
      {canGoPrevious && (
        <Button
          variant="navigation"
          size="icon"
          className={`${styles.navButton} ${styles.previous}`}
          onClick={onPrevious}
          disabled={navigationDisabled}
          aria-label={t("lightbox.previous")}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}

      <div
        className={`${styles.canvas} ${zoom > 1 ? styles.zoomed : ""} ${isDragging ? styles.dragging : ""}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {thumbnailSrc && !error && (
          <img
            key={`thumbnail-${photo.id}`}
            src={thumbnailSrc}
            alt=""
            className={`${styles.image} ${styles.thumbnail} ${loading ? styles.visible : ""}`}
            style={{ transform }}
            draggable={false}
          />
        )}

        {loading && !thumbnailSrc && !error && (
          <div className={styles.loading} aria-live="polite">
            <Spinner label={t("lightbox.openingPreview")} size="md" />
          </div>
        )}

        {error && (
          <EmptyState
            icon={<ImageOff aria-hidden="true" />}
            title={t("lightbox.previewFailed")}
            description={error}
            actions={<Button variant="secondary" size="sm" onClick={onRetry}>{t("common.retry")}</Button>}
            role="alert"
          />
        )}

        {previewSrc && !error && (
          <img
            key={`preview-${photo.id}`}
            src={previewSrc}
            alt={photo.filename}
            className={`${styles.image} ${styles.preview} ${loading ? styles.imageLoading : styles.visible}`}
            style={{ transform }}
            draggable={false}
            decoding="async"
            onLoad={onLoaded}
            onError={onLoaded}
          />
        )}
      </div>

      {canGoNext && (
        <Button
          variant="navigation"
          size="icon"
          className={`${styles.navButton} ${styles.next}`}
          onClick={onNext}
          disabled={navigationDisabled}
          aria-label={t("lightbox.next")}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </section>
  );
}
