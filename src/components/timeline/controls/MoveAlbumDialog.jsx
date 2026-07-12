import { useEffect, useId, useRef } from "react";
import { Folder, FolderInput, LoaderCircle, X } from "lucide-react";
import styles from "./MoveAlbumDialog.module.css";

export default function MoveAlbumDialog({
  open,
  albums = [],
  selectedCount = 0,
  busy = false,
  error = null,
  onSelect,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        aria-busy={busy}
      >
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <FolderInput aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId}>移动到相册</h2>
            <p id={descriptionId}>
              {selectedCount > 0 ? `为已选择的 ${selectedCount} 张照片选择目标相册。` : "请选择目标相册。"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭移动照片对话框"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {error ? (
            <p className={styles.error} id={errorId} role="alert">
              {typeof error === "string" ? error : error.message || "无法移动照片，请重试。"}
            </p>
          ) : null}

          {albums.length === 0 ? (
            <div className={styles.empty}>
              <Folder aria-hidden="true" />
              <strong>暂无可用相册</strong>
              <span>请先创建一个相册，再移动照片。</span>
            </div>
          ) : (
            <div className={styles.albumList}>
              {albums.map((album) => (
                <button
                  type="button"
                  key={album.id}
                  onClick={() => onSelect?.(album.id)}
                  disabled={busy}
                >
                  <span className={styles.albumIcon}>
                    {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Folder aria-hidden="true" />}
                  </span>
                  <span className={styles.albumName}>{album.name}</span>
                  {Number.isFinite(Number(album.photoCount)) ? (
                    <small>{Number(album.photoCount)} 张</small>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
