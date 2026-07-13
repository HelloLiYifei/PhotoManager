import { FolderPlus } from "lucide-react";

import { Button, Dialog, Field, Spinner } from "./ui";
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
  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    onSubmit?.(event);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="创建新相册"
      description="为照片创建一个新的整理空间。"
      closeLabel="关闭创建相册对话框"
      closeDisabled={busy}
      panelClassName={styles.sharedDialog}
    >
      <form className={styles.form} onSubmit={handleSubmit} aria-busy={busy}>
          <Field label="相册名称" htmlFor="create-album-name">
            <input
              id="create-album-name"
              type="text"
              value={name}
              onChange={(event) => onNameChange?.(event.target.value)}
              placeholder="例如：杭州之旅"
              autoComplete="off"
              required
              disabled={busy}
              autoFocus
            />
          </Field>

          <Field
            label={<>描述 <small>可选</small></>}
            htmlFor="create-album-description"
          >
            <textarea
              id="create-album-description"
              value={description}
              onChange={(event) => onDescriptionChange?.(event.target.value)}
              placeholder="简单描述这个相册"
              rows={3}
              disabled={busy}
            />
          </Field>

          {error ? (
            <p className={styles.error} role="alert">
              {typeof error === "string" ? error : error.message || "创建相册失败，请重试。"}
            </p>
          ) : null}

          <footer className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
              aria-label={busy ? "正在创建…" : "创建相册"}
            >
              {busy ? (
                <>
                  <Spinner label="正在创建" size="sm" />
                  正在创建…
                </>
              ) : (
                <>
                  <FolderPlus aria-hidden="true" />
                  创建相册
                </>
              )}
            </Button>
          </footer>
        </form>
    </Dialog>
  );
}
