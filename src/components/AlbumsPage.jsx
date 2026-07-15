import { useEffect, useState } from "react";
import {
  AlertCircle,
  FolderOpen,
  Image as ImageIcon,
  Plus,
  RefreshCw,
} from "lucide-react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { useI18n } from "../i18n";
import { Button, EmptyState, Spinner } from "./ui";
import { albumsPageStyles as styles } from "../themes/classNames";

function AlbumCover({ album }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", src: "" });

  useEffect(() => {
    let active = true;

    if (!album.coverPhotoId) {
      setState({ status: "empty", src: "" });
      return () => {
        active = false;
      };
    }

    setState({ status: "loading", src: "" });
    loadPhotoThumbnail(album.coverPhotoId, 1)
      .then((src) => {
        if (active) setState({ status: "ready", src });
      })
      .catch(() => {
        if (active) setState({ status: "error", src: "" });
      });

    return () => {
      active = false;
    };
  }, [album.coverPhotoId]);

  if (state.status === "ready") {
    return (
      <img
        className={styles.coverImage}
        src={state.src}
        alt={t("albums.coverAlt", { name: album.name })}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <span className={styles.coverStatus} role="status">
        <Spinner label={t("albums.coverLoading", { name: album.name })} size="sm" />
        <span className={styles.srOnly}>{t("albums.coverLoading", { name: album.name })}</span>
      </span>
    );
  }

  return (
    <span
      className={styles.coverStatus}
      title={state.status === "error" ? t("albums.coverFailed") : t("albums.noCover")}
    >
      <ImageIcon aria-hidden="true" />
      <span className={styles.srOnly}>
        {state.status === "error" ? t("albums.coverFailed") : t("albums.noCover")}
      </span>
    </span>
  );
}

function getErrorMessage(error, fallback) {
  if (typeof error === "string") return error;
  return error?.message || fallback;
}

export default function AlbumsPage({
  albums = [],
  loading = false,
  error = null,
  onRetry,
  onOpenAlbum,
  onCreateAlbum,
}) {
  const { t, formatNumber } = useI18n();
  if (loading) {
    return (
      <section className={styles.centeredState} aria-label={t("nav.albums")} aria-busy="true">
        <Spinner label={t("albums.loading")} size="lg" showLabel />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.centeredState} aria-label={t("albums.loadFailed")}>
        <EmptyState
          icon={AlertCircle}
          title={t("albums.loadFailed")}
          description={getErrorMessage(error, t("albums.loadFallback"))}
          role="alert"
          actions={(
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw size={16} aria-hidden="true" />
              {t("common.retry")}
            </Button>
          )}
        />
      </section>
    );
  }

  if (albums.length === 0) {
    return (
      <section className={styles.centeredState} aria-label={t("albums.emptyLabel")}>
        <EmptyState
          icon={FolderOpen}
          title={t("albums.empty")}
          description={t("albums.emptyDescription")}
          actions={(
            <Button variant="primary" onClick={onCreateAlbum}>
              <Plus size={17} aria-hidden="true" />
              {t("albums.create")}
            </Button>
          )}
        />
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label={t("nav.albums")}>
      <div className={styles.grid}>
        <button
          className={`${styles.card} ${styles.createCard}`}
          type="button"
          onClick={onCreateAlbum}
        >
          <span className={styles.createIcon}>
            <Plus aria-hidden="true" />
          </span>
          <span className={styles.createTitle}>{t("albums.createNew")}</span>
          <span className={styles.createHint}>{t("albums.createHint")}</span>
        </button>

        {albums.map((album) => (
          <button
            className={styles.card}
            type="button"
            key={album.id}
            onClick={() => onOpenAlbum?.(album)}
            aria-label={t("albums.openLabel", { name: album.name, count: formatNumber(album.photoCount || 0) })}
          >
            <span className={styles.cover}>
              <AlbumCover album={album} />
            </span>
            <span className={styles.cardBody}>
              <span className={styles.cardTitle} title={album.name}>
                {album.name}
              </span>
              {album.description ? (
                <span className={styles.description} title={album.description}>
                  {album.description}
                </span>
              ) : null}
              <span className={styles.photoCount}>{t("albums.photoCount", { count: formatNumber(album.photoCount || 0) })}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
