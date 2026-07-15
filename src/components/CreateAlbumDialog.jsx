import { FolderPlus } from "lucide-react";

import { Button, Dialog, Field, Spinner } from "./ui";
import { useI18n } from "../i18n";
import { createAlbumDialogStyles as styles } from "../themes/classNames";

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
  const { t } = useI18n();
  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    onSubmit?.(event);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("albumDialog.title")}
      description={t("albumDialog.description")}
      closeLabel={t("albumDialog.close")}
      closeDisabled={busy}
      panelClassName={styles.sharedDialog}
    >
      <form className={styles.form} onSubmit={handleSubmit} aria-busy={busy}>
          <Field label={t("albumDialog.name")} htmlFor="create-album-name">
            <input
              id="create-album-name"
              type="text"
              value={name}
              onChange={(event) => onNameChange?.(event.target.value)}
              placeholder={t("albumDialog.namePlaceholder")}
              autoComplete="off"
              required
              disabled={busy}
              autoFocus
            />
          </Field>

          <Field
            label={<>{t("albumDialog.descriptionField")} <small>{t("albumDialog.optional")}</small></>}
            htmlFor="create-album-description"
          >
            <textarea
              id="create-album-description"
              value={description}
              onChange={(event) => onDescriptionChange?.(event.target.value)}
              placeholder={t("albumDialog.descriptionPlaceholder")}
              rows={3}
              disabled={busy}
            />
          </Field>

          {error ? (
            <p className={styles.error} role="alert">
              {typeof error === "string" ? error : error.message || t("albumDialog.error")}
            </p>
          ) : null}

          <footer className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
              aria-label={busy ? t("albumDialog.creating") : t("albums.create")}
            >
              {busy ? (
                <>
                  <Spinner label={t("albumDialog.creating")} size="sm" />
                  {t("albumDialog.creating")}
                </>
              ) : (
                <>
                  <FolderPlus aria-hidden="true" />
                  {t("albums.create")}
                </>
              )}
            </Button>
          </footer>
        </form>
    </Dialog>
  );
}
