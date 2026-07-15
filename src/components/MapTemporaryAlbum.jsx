import { ArrowLeft, MapPinned } from "lucide-react";

import { useI18n } from "../i18n";
import { Button } from "./ui";
import TimelineGrid from "./TimelineGrid";
import { mapTemporaryAlbumStyles as styles } from "../themes/classNames";

export default function MapTemporaryAlbum({
  workspace,
  album,
  refreshTrigger,
  onBack,
  onPhotoClick,
  onPhotosUpdated,
}) {
  const { t, formatNumber } = useI18n();
  const count = album?.photoIds?.length || 0;
  const coordinates = Number.isFinite(album?.latitude) && Number.isFinite(album?.longitude)
    ? `${album.latitude.toFixed(5)}, ${album.longitude.toFixed(5)}`
    : t("map.temporaryAlbumArea");

  return (
    <section className={styles.page} aria-label={t("map.temporaryAlbumTitle")}>
      <header className={styles.header}>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t("map.backToMap")}
        </Button>
        <span className={styles.icon} aria-hidden="true"><MapPinned /></span>
        <div className={styles.heading}>
          <span>{t("map.temporaryAlbumBadge")}</span>
          <h2>{t("map.temporaryAlbumCount", { count: formatNumber(count) })}</h2>
          <p>{coordinates} · {t("map.temporaryAlbumHint")}</p>
        </div>
      </header>

      <div className={styles.browser}>
        <TimelineGrid
          workspace={workspace}
          currentView="map-album"
          albumId={null}
          indexedPhotoIds={album?.photoIds || []}
          refreshTrigger={refreshTrigger}
          onPhotosUpdated={onPhotosUpdated}
          onPhotoClick={onPhotoClick}
        />
      </div>
    </section>
  );
}
