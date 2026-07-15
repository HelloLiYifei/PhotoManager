import { MapPin, Tag, X } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button, EmptyState, Field } from "../ui";
import { lightboxStyles as styles } from "../../themes/classNames";

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
  const { formatBytes, t } = useI18n();
  const hasLocation = Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude);
  const fileSize = Number.isFinite(photo.fileSize)
    ? formatBytes(photo.fileSize)
    : "—";

  return (
    <div className={styles.infoPanel}>
      <section className={styles.infoSection} aria-labelledby="lightbox-exif-heading">
        <h2 id="lightbox-exif-heading">{t("photo.captureInfo")}</h2>
        <dl className={styles.metadataGrid}>
          <MetadataItem label={t("photo.cameraMake")} value={displayValue(photo.cameraMake)} />
          <MetadataItem label={t("photo.cameraModel")} value={displayValue(photo.cameraModel)} />
          <MetadataItem label={t("photo.lensModel")} value={displayValue(photo.lensModel)} wide />
          <MetadataItem label={t("photo.exposureTime")} value={displayValue(photo.exposureTime)} />
          <MetadataItem label={t("photo.aperture")} value={photo.fNumber ? `f/${photo.fNumber}` : "—"} />
          <MetadataItem label={t("photo.iso")} value={displayValue(photo.iso, photo.iso ? " ISO" : "")} />
          <MetadataItem label={t("photo.focalLength")} value={displayValue(photo.focalLength, photo.focalLength ? " mm" : "")} />
        </dl>
      </section>

      {hasLocation && (
        <section className={styles.infoSection} aria-labelledby="lightbox-location-heading">
          <h2 id="lightbox-location-heading">{t("photo.location")}</h2>
          {showMapAction ? (
            <Button variant="secondary" className={styles.mapButton} onClick={() => onShowOnMap?.(photo)}>
              <MapPin aria-hidden="true" />
              <span>
                <strong>{t("photo.showOnMap")}</strong>
                <small>{photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}</small>
              </span>
            </Button>
          ) : (
            <div className={styles.locationCoordinates} aria-label={t("photo.gpsCoordinates")}>
              <MapPin aria-hidden="true" />
              <span>{photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}</span>
            </div>
          )}
        </section>
      )}

      {showTags && <section className={styles.infoSection} aria-labelledby="lightbox-tags-heading">
        <h2 id="lightbox-tags-heading">{t("photo.tags")}</h2>
        {tags.length > 0 ? (
          <div className={styles.tagList} aria-label={t("photo.tagsLabel")}>
            {tags.map((tagName) => (
              <span className={styles.tagChip} key={tagName}>
                <Tag aria-hidden="true" />
                {tagName}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveTag(tagName)}
                  disabled={disabled}
                  aria-label={t("photo.removeTag", { name: tagName })}
                >
                  <X aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
        ) : (
          <EmptyState title={t("photo.noTags")} description={t("photo.noTagsDescription")} />
        )}
        <form className={styles.tagForm} onSubmit={onAddTag}>
          <Field label={t("photo.newTag")} htmlFor="lightbox-new-tag" hint={t("photo.addTagHint")}>
            <div className={styles.tagInputRow}>
              <input
                id="lightbox-new-tag"
                type="text"
                value={tagInput}
                onChange={(event) => onTagInputChange(event.target.value)}
                placeholder={t("photo.tagPlaceholder")}
                disabled={disabled}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={disabled || !tagInput.trim()}>
                {t("common.add")}
              </Button>
            </div>
          </Field>
        </form>
      </section>}

      <section className={styles.infoSection} aria-labelledby="lightbox-file-heading">
        <h2 id="lightbox-file-heading">{t("photo.fileInfo")}</h2>
        <dl className={`${styles.metadataGrid} ${styles.fileGrid}`}>
          <MetadataItem label={t("photo.filename")} value={displayValue(photo.filename)} wide />
          <MetadataItem label={t("photo.path")} value={displayValue(photo.path)} mono wide />
          <MetadataItem label={t("photo.fileSize")} value={fileSize} />
          <MetadataItem
            label={t("photo.dimensions")}
            value={photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—"}
          />
          <MetadataItem label={t("photo.dateTaken")} value={displayValue(photo.dateTaken)} wide />
        </dl>
      </section>
    </div>
  );
}
