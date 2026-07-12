import { Image as ImageIcon, Plus, RotateCcw, Star, Tag, X } from "lucide-react";
import styles from "./PhotoInspector.module.css";

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

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
  if (!photo) return null;

  const rating = Number(photo.rating) || 0;
  const dimensions = photo.width && photo.height
    ? `${photo.width} × ${photo.height}`
    : "未知";

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" onMouseDown={() => onClose?.()} />
      <aside className={styles.inspector} aria-label="照片属性面板">
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <ImageIcon aria-hidden="true" />
          </span>
          <div>
            <h2>照片属性</h2>
            <p title={photo.filename}>{photo.filename || "未命名照片"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭照片属性面板">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.section} aria-labelledby="photo-details-heading">
            <h3 id="photo-details-heading">文件与拍摄参数</h3>
            <dl className={styles.details}>
              <DetailRow label="名称">{photo.filename || "未知"}</DetailRow>
              <DetailRow label="路径">{photo.path || "未知"}</DetailRow>
              <DetailRow label="格式">{photo.fileType || "未知"}</DetailRow>
              <DetailRow label="尺寸">{dimensions}</DetailRow>
              <DetailRow label="大小">{formatFileSize(photo.fileSize)}</DetailRow>
              <DetailRow label="拍摄日期">{photo.dateTaken || "无"}</DetailRow>
              <DetailRow label="相机制造商">{photo.cameraMake}</DetailRow>
              <DetailRow label="相机型号">{photo.cameraModel}</DetailRow>
              <DetailRow label="镜头">{photo.lensModel}</DetailRow>
              <DetailRow label="曝光时间">{photo.exposureTime ? `${photo.exposureTime} s` : null}</DetailRow>
              <DetailRow label="光圈">{photo.fNumber ? `F/${photo.fNumber}` : null}</DetailRow>
              <DetailRow label="ISO">{photo.iso}</DetailRow>
              <DetailRow label="焦距">{photo.focalLength ? `${photo.focalLength} mm` : null}</DetailRow>
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="photo-rating-heading">
            <div className={styles.sectionHeading}>
              <Star aria-hidden="true" />
              <h3 id="photo-rating-heading">评分</h3>
            </div>
            <div className={styles.rating} role="group" aria-label="照片评分">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={star <= rating ? styles.activeStar : undefined}
                  onClick={() => onRatingChange?.(star)}
                  aria-label={`设为 ${star} 星`}
                  aria-pressed={rating === star}
                >
                  <Star aria-hidden="true" fill={star <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              <button
                className={styles.clearRating}
                type="button"
                onClick={() => onRatingChange?.(0)}
                aria-label="清除评分"
                disabled={rating === 0}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="photo-tags-heading">
            <div className={styles.sectionHeading}>
              <Tag aria-hidden="true" />
              <h3 id="photo-tags-heading">照片标签</h3>
            </div>

            <div className={styles.tagList} aria-live="polite">
              {tags.length === 0 ? (
                <span className={styles.emptyTags}>暂无标签</span>
              ) : tags.map((tag) => (
                <span className={styles.tagChip} key={tag}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => onRemoveTag?.(tag)}
                    aria-label={`删除标签 ${tag}`}
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
                <span className={styles.visuallyHidden}>新标签</span>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(event) => onNewTagInputChange?.(event.target.value)}
                  placeholder="输入新标签…"
                  autoComplete="off"
                />
              </label>
              <button type="submit" disabled={!newTagInput.trim()}>
                <Plus aria-hidden="true" />
                添加
              </button>
            </form>
          </section>
        </div>
      </aside>
    </>
  );
}
