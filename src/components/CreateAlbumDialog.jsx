import { useEffect, useId, useRef } from "react";
import { FolderPlus, LoaderCircle, X } from "lucide-react";
import styles from "./CreateAlbumDialog.module.css";

export default function CreateAlbumDialog({
  open,
  name = "",
  description = "",
  busy = false,
  error = null,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    nameInputRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    onSubmit?.(event);
  };

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget && !busy) onClose?.();
  };

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdropPointerDown}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        aria-busy={busy}
      >
        <header className={styles.header}>
          <span className={styles.titleIcon}>
            <FolderPlus aria-hidden="true" />
          </span>
          <div className={styles.heading}>
            <h2 id={titleId}>创建新相册</h2>
            <p id={descriptionId}>为照片创建一个新的整理空间。</p>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={onClose}
            aria-label="关闭创建相册对话框"
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>相册名称</span>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => onNameChange?.(event.target.value)}
              placeholder="例如：杭州之旅"
              autoComplete="off"
              required
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span>描述 <small>可选</small></span>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange?.(event.target.value)}
              placeholder="简单描述这个相册"
              rows={3}
              disabled={busy}
            />
          </label>

          {error ? (
            <p className={styles.error} id={errorId} role="alert">
              {typeof error === "string" ? error : error.message || "创建相册失败，请重试。"}
            </p>
          ) : null}

          <footer className={styles.actions}>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </button>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy ? (
                <>
                  <LoaderCircle className={styles.spinner} aria-hidden="true" />
                  正在创建…
                </>
              ) : (
                <>
                  <FolderPlus aria-hidden="true" />
                  创建相册
                </>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
