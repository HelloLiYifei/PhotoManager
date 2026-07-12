import { useEffect, useState } from "react";
import {
  AlertCircle,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import styles from "./AlbumsPage.module.css";

function AlbumCover({ album }) {
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
        alt={`${album.name}的封面`}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <span className={styles.coverStatus} role="status">
        <LoaderCircle className={styles.spinner} aria-hidden="true" />
        <span className={styles.srOnly}>正在加载{album.name}的封面</span>
      </span>
    );
  }

  return (
    <span
      className={styles.coverStatus}
      title={state.status === "error" ? "封面加载失败" : "相册暂无封面"}
    >
      <ImageIcon aria-hidden="true" />
      <span className={styles.srOnly}>
        {state.status === "error" ? "封面加载失败" : "相册暂无封面"}
      </span>
    </span>
  );
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message || "无法加载相册，请稍后重试。";
}

export default function AlbumsPage({
  albums = [],
  loading = false,
  error = null,
  onRetry,
  onOpenAlbum,
  onCreateAlbum,
}) {
  if (loading) {
    return (
      <section className={styles.centeredState} aria-label="相册" aria-busy="true">
        <LoaderCircle className={styles.stateSpinner} aria-hidden="true" />
        <p>正在加载相册…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.centeredState} aria-label="相册加载失败">
        <AlertCircle className={styles.errorIcon} aria-hidden="true" />
        <div>
          <h2>相册加载失败</h2>
          <p role="alert">{getErrorMessage(error)}</p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          重试
        </button>
      </section>
    );
  }

  if (albums.length === 0) {
    return (
      <section className={styles.centeredState} aria-label="相册为空">
        <span className={styles.emptyIcon}>
          <FolderOpen aria-hidden="true" />
        </span>
        <div>
          <h2>还没有相册</h2>
          <p>创建一个相册，开始整理你的照片。</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={onCreateAlbum}>
          <Plus size={17} aria-hidden="true" />
          创建相册
        </button>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="相册">
      <div className={styles.grid}>
        <button
          className={`${styles.card} ${styles.createCard}`}
          type="button"
          onClick={onCreateAlbum}
        >
          <span className={styles.createIcon}>
            <Plus aria-hidden="true" />
          </span>
          <span className={styles.createTitle}>创建新相册</span>
          <span className={styles.createHint}>整理一组新的照片</span>
        </button>

        {albums.map((album) => (
          <button
            className={styles.card}
            type="button"
            key={album.id}
            onClick={() => onOpenAlbum?.(album)}
            aria-label={`打开相册${album.name}，${album.photoCount || 0}张照片`}
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
              <span className={styles.photoCount}>{album.photoCount || 0} 张照片</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
