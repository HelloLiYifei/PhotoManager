import { Folder, FolderInput } from "lucide-react";

import { Button, Dialog, EmptyState, Spinner } from "../../ui";
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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="移动到相册"
      description={selectedCount > 0
        ? `为已选择的 ${selectedCount} 张照片选择目标相册。`
        : "请选择目标相册。"}
      closeLabel="关闭移动照片对话框"
      closeDisabled={busy}
      panelClassName={styles.sharedDialog}
    >
        <div className={styles.body} aria-busy={busy}>
          {error ? (
            <p className={styles.error} role="alert">
              {typeof error === "string" ? error : error.message || "无法移动照片，请重试。"}
            </p>
          ) : null}

          {albums.length === 0 ? (
            <EmptyState
              icon={Folder}
              title="暂无可用相册"
              description="请先创建一个相册，再移动照片。"
            />
          ) : (
            <div className={styles.albumList}>
              {albums.map((album) => (
                <Button
                  key={album.id}
                  variant="secondary"
                  onClick={() => onSelect?.(album.id)}
                  disabled={busy}
                >
                  <span className={styles.albumIcon}>
                    {busy ? <Spinner label="正在移动" size="sm" /> : <Folder aria-hidden="true" />}
                  </span>
                  <span className={styles.albumName}>{album.name}</span>
                  {Number.isFinite(Number(album.photoCount)) ? (
                    <small>{Number(album.photoCount)} 张</small>
                  ) : null}
                </Button>
              ))}
            </div>
          )}
        </div>
    </Dialog>
  );
}
