import { MapPin, Tag, X } from "lucide-react";
import { Button, EmptyState, Field } from "../ui";
import styles from "./Lightbox.module.css";

const displayValue = (value, suffix = "") => (
  value === null || value === undefined || value === "" ? "—" : `${value}${suffix}`
);

function MetadataItem({ label, value, wide = false, mono = false }) {
  return (
    <div className={`${styles.metadataItem} ${wide ? styles.metadataWide : ""}`}>
      <dt>{label}</dt>
      <dd className={mono ? styles.mono : ""}>{value}</dd>
    </div>
  );
}

export default function LightboxInfoPanel({
  photo,
  tags = [],
  tagInput = "",
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onShowOnMap,
  disabled,
  showTags = true,
  showMapAction = true,
}) {
  const hasLocation = Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude);
  const fileSize = Number.isFinite(photo.fileSize)
    ? `${(photo.fileSize / (1024 * 1024)).toFixed(2)} MB`
    : "—";

  return (
    <div className={styles.infoPanel}>
      <section className={styles.infoSection} aria-labelledby="lightbox-exif-heading">
        <h2 id="lightbox-exif-heading">拍摄信息</h2>
        <dl className={styles.metadataGrid}>
          <MetadataItem label="相机品牌" value={displayValue(photo.cameraMake)} />
          <MetadataItem label="相机型号" value={displayValue(photo.cameraModel)} />
          <MetadataItem label="镜头型号" value={displayValue(photo.lensModel)} wide />
          <MetadataItem label="快门速度" value={displayValue(photo.exposureTime)} />
          <MetadataItem label="光圈" value={photo.fNumber ? `f/${photo.fNumber}` : "—"} />
          <MetadataItem label="感光度" value={displayValue(photo.iso, photo.iso ? " ISO" : "")} />
          <MetadataItem label="焦距" value={displayValue(photo.focalLength, photo.focalLength ? " mm" : "")} />
        </dl>
      </section>

      {hasLocation && (
        <section className={styles.infoSection} aria-labelledby="lightbox-location-heading">
          <h2 id="lightbox-location-heading">拍摄位置</h2>
          {showMapAction ? (
            <Button variant="secondary" className={styles.mapButton} onClick={() => onShowOnMap?.(photo)}>
              <MapPin aria-hidden="true" />
              <span>
                <strong>在地图中查看</strong>
                <small>{photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}</small>
              </span>
            </Button>
          ) : (
            <div className={styles.locationCoordinates} aria-label="照片 GPS 坐标">
              <MapPin aria-hidden="true" />
              <span>{photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}</span>
            </div>
          )}
        </section>
      )}

      {showTags && <section className={styles.infoSection} aria-labelledby="lightbox-tags-heading">
        <h2 id="lightbox-tags-heading">标签</h2>
        {tags.length > 0 ? (
          <div className={styles.tagList} aria-label="照片标签">
            {tags.map((tagName) => (
              <span className={styles.tagChip} key={tagName}>
                <Tag aria-hidden="true" />
                {tagName}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveTag(tagName)}
                  disabled={disabled}
                  aria-label={`移除标签 ${tagName}`}
                >
                  <X aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无标签" description="添加标签以便查找和整理这张照片。" />
        )}
        <form className={styles.tagForm} onSubmit={onAddTag}>
          <Field label="新标签" htmlFor="lightbox-new-tag" hint="按回车或选择添加">
            <div className={styles.tagInputRow}>
              <input
                id="lightbox-new-tag"
                type="text"
                value={tagInput}
                onChange={(event) => onTagInputChange(event.target.value)}
                placeholder="例如：旅行"
                disabled={disabled}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={disabled || !tagInput.trim()}>
                添加
              </Button>
            </div>
          </Field>
        </form>
      </section>}

      <section className={styles.infoSection} aria-labelledby="lightbox-file-heading">
        <h2 id="lightbox-file-heading">文件信息</h2>
        <dl className={`${styles.metadataGrid} ${styles.fileGrid}`}>
          <MetadataItem label="文件名" value={displayValue(photo.filename)} wide />
          <MetadataItem label="路径" value={displayValue(photo.path)} mono wide />
          <MetadataItem label="文件大小" value={fileSize} />
          <MetadataItem
            label="图片尺寸"
            value={photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—"}
          />
          <MetadataItem label="拍摄时间" value={displayValue(photo.dateTaken)} wide />
        </dl>
      </section>
    </div>
  );
}
