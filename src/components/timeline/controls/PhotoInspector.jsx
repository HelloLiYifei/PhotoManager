import { Image as ImageIcon, Plus, RotateCcw, Star, Tag, X } from "lucide-react";
import { useI18n } from "../../../i18n";
import styles from "./PhotoInspector.module.css";

function DetailRow({ label, children }) {
  if (children === undefined || children === null || children === "") return null;

  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function PhotoInspector({
  photo,
  tags = [],
  newTagInput = "",
  onNewTagInputChange,
  onAddTag,
  onRemoveTag,
  onRatingChange,
  onClose,
}) {
  const { t } = useI18n();
  if (!photo) return null;

  const rating = Number(photo.rating) || 0;
  const dimensions = photo.width && photo.height
    ? `${photo.width} × ${photo.height}`
    : t("common.unknown");
  const fileSizeValue = Number(photo.fileSize);
  const fileSize = !Number.isFinite(fileSizeValue) || fileSizeValue < 0
    ? t("common.unknown")
    : fileSizeValue < 1024
      ? `${fileSizeValue} B`
      : fileSizeValue < 1024 * 1024
        ? `${(fileSizeValue / 1024).toFixed(1)} KB`
        : `${(fileSizeValue / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" onMouseDown={() => onClose?.()} />
      <aside className={styles.inspector} aria-label={t("photo.inspectorLabel")}>
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <ImageIcon aria-hidden="true" />
          </span>
          <div>
            <h2>{t("photo.properties")}</h2>
            <p title={photo.filename}>{photo.filename || t("photo.untitled")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("photo.closeInspector")}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.section} aria-labelledby="photo-details-heading">
            <h3 id="photo-details-heading">{t("photo.fileAndCapture")}</h3>
            <dl className={styles.details}>
              <DetailRow label={t("photo.name")}>{photo.filename || t("common.unknown")}</DetailRow>
              <DetailRow label={t("photo.path")}>{photo.path || t("common.unknown")}</DetailRow>
              <DetailRow label={t("photo.format")}>{photo.fileType || t("common.unknown")}</DetailRow>
              <DetailRow label={t("photo.dimensions")}>{dimensions}</DetailRow>
              <DetailRow label={t("photo.fileSize")}>{fileSize}</DetailRow>
              <DetailRow label={t("photo.dateTaken")}>{photo.dateTaken || t("common.none")}</DetailRow>
              <DetailRow label={t("photo.cameraMake")}>{photo.cameraMake}</DetailRow>
              <DetailRow label={t("photo.cameraModel")}>{photo.cameraModel}</DetailRow>
              <DetailRow label={t("photo.lens")}>{photo.lensModel}</DetailRow>
              <DetailRow label={t("photo.exposureTime")}>{photo.exposureTime ? `${photo.exposureTime} s` : null}</DetailRow>
              <DetailRow label={t("photo.aperture")}>{photo.fNumber ? `F/${photo.fNumber}` : null}</DetailRow>
              <DetailRow label="ISO">{photo.iso}</DetailRow>
              <DetailRow label={t("photo.focalLength")}>{photo.focalLength ? `${photo.focalLength} mm` : null}</DetailRow>
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="photo-rating-heading">
            <div className={styles.sectionHeading}>
              <Star aria-hidden="true" />
              <h3 id="photo-rating-heading">{t("photo.rating")}</h3>
            </div>
            <div className={styles.rating} role="group" aria-label={t("photo.rating")}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={star <= rating ? styles.activeStar : undefined}
                  onClick={() => onRatingChange?.(star)}
                  aria-label={t("photo.setStars", { count: star })}
                  aria-pressed={rating === star}
                >
                  <Star aria-hidden="true" fill={star <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              <button
                className={styles.clearRating}
                type="button"
                onClick={() => onRatingChange?.(0)}
                aria-label={t("photo.clearRating")}
                disabled={rating === 0}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="photo-tags-heading">
            <div className={styles.sectionHeading}>
              <Tag aria-hidden="true" />
              <h3 id="photo-tags-heading">{t("photo.tagsLabel")}</h3>
            </div>

            <div className={styles.tagList} aria-live="polite">
              {tags.length === 0 ? (
                <span className={styles.emptyTags}>{t("photo.noTags")}</span>
              ) : tags.map((tag) => (
                <span className={styles.tagChip} key={tag}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => onRemoveTag?.(tag)}
                    aria-label={t("photo.deleteTag", { name: tag })}
                  >
                    <X aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>

            <form
              className={styles.tagForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (newTagInput.trim()) onAddTag?.(event);
              }}
            >
              <label>
                <span className={styles.visuallyHidden}>{t("photo.newTag")}</span>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(event) => onNewTagInputChange?.(event.target.value)}
                  placeholder={t("photo.newTagPlaceholder")}
                  autoComplete="off"
                />
              </label>
              <button type="submit" disabled={!newTagInput.trim()}>
                <Plus aria-hidden="true" />
                {t("common.add")}
              </button>
            </form>
          </section>
        </div>
      </aside>
    </>
  );
}
