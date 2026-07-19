import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "../../../i18n";
import GalleryView from "./GalleryView";
import MasonryView from "./MasonryView";
import {
  batchActionBarStyles as batchStyles,
  timelineGridStyles as styles,
} from "../../../themes/classNames";

function actionButtonClassName(variant = "") {
  return [batchStyles.actionButton, variant ? batchStyles[variant] : ""]
    .filter(Boolean)
    .join(" ");
}

function CompareActionBar({
  activeIndex,
  photoCount = 0,
  onNavigate,
  onReturn,
  t,
}) {
  return (
    <div className={batchStyles.bar}>
      <div className={batchStyles.actions}>
        {onReturn ? (
          <button
            type="button"
            className={actionButtonClassName()}
            onClick={onReturn}
            aria-label={t("timeline.returnToCompareAlbum")}
          >
            <ArrowLeft aria-hidden="true" />
            <span>{t("timeline.returnToCompareAlbum")}</span>
          </button>
        ) : null}
        {onNavigate ? (
          <button
            type="button"
            className={actionButtonClassName()}
            onClick={() => onNavigate(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label={t("timeline.previous")}
          >
            <ChevronLeft aria-hidden="true" />
            <span>{t("timeline.previous")}</span>
          </button>
        ) : null}
        {onNavigate ? (
          <button
            type="button"
            className={actionButtonClassName()}
            onClick={() => onNavigate(activeIndex + 1)}
            disabled={activeIndex >= photoCount - 1}
            aria-label={t("timeline.next")}
          >
            <ChevronRight aria-hidden="true" />
            <span>{t("timeline.next")}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function CompareBrowser({ photos, lockedId, scrollRoot }) {
  const { t } = useI18n();
  const [detailPhotoId, setDetailPhotoId] = useState(null);
  const detailPhoto = photos.find((photo) => photo.id === detailPhotoId) ?? null;

  useEffect(() => {
    if (detailPhotoId !== null && !detailPhoto) setDetailPhotoId(null);
  }, [detailPhoto, detailPhotoId]);

  const openDetail = (photo) => {
    setDetailPhotoId(photo.id);
  };

  if (detailPhoto) {
    const activeIndex = photos.findIndex((photo) => photo.id === detailPhoto.id);
    const navigateTo = (index) => {
      const nextIndex = Math.max(0, Math.min(photos.length - 1, index));
      if (nextIndex !== activeIndex) openDetail(photos[nextIndex]);
    };

    return (
      <section className={styles.compareBrowserDetail} aria-label={t("timeline.compareDetail")}>
        <GalleryView
          photos={photos}
          activePhoto={detailPhoto}
          scrollRoot={scrollRoot}
          navigationPlacement="none"
          captionControls={(
            <CompareActionBar
              activeIndex={activeIndex}
              photoCount={photos.length}
              onNavigate={navigateTo}
              onReturn={() => setDetailPhotoId(null)}
              t={t}
            />
          )}
          onSelect={openDetail}
          onOpen={(photoList, index) => openDetail(photoList[index])}
        />
      </section>
    );
  }

  return (
    <section className={styles.compareAlbum} aria-label={t("timeline.compareAlbum")}>
      <MasonryView
        photos={photos}
        compareLockedId={lockedId}
        scrollRoot={scrollRoot}
        onSelect={openDetail}
        onOpen={(photoList, index) => openDetail(photoList[index])}
      />
    </section>
  );
}
