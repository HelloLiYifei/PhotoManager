import { Folder, FolderInput } from "lucide-react";

import { useI18n } from "../../../i18n";
import { Button, Dialog, EmptyState, Spinner } from "../../ui";
import { moveAlbumDialogStyles as styles } from "../../../themes/classNames";

export default function MoveAlbumDialog({
  open,
  albums = [],
  selectedCount = 0,
  busy = false,
  error = null,
  onSelect,
  onClose,
}) {
  const { formatNumber, t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("batch.moveToAlbum")}
      description={selectedCount > 0
        ? t("batch.moveSelectedDescription", { count: formatNumber(selectedCount) })
        : t("batch.chooseAlbumDescription")}
      closeLabel={t("batch.closeMoveDialog")}
      closeDisabled={busy}
      panelClassName={styles.sharedDialog}
    >
        <div className={styles.body} aria-busy={busy}>
          {error ? (
            <p className={styles.error} role="alert">
              {typeof error === "string" ? error : error.message || t("batch.moveFailed")}
            </p>
          ) : null}

          {albums.length === 0 ? (
            <EmptyState
              icon={Folder}
              title={t("batch.noAlbums")}
              description={t("batch.noAlbumsDescription")}
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
                    {busy ? <Spinner label={t("batch.moving")} size="sm" /> : <Folder aria-hidden="true" />}
                  </span>
                  <span className={styles.albumName}>{album.name}</span>
                  {Number.isFinite(Number(album.photoCount)) ? (
                    <small>{t("common.photoCount", { count: formatNumber(album.photoCount) })}</small>
                  ) : null}
                </Button>
              ))}
            </div>
          )}
        </div>
    </Dialog>
  );
}
