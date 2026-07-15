import {
  Columns2,
  Download,
  Eraser,
  FolderInput,
  Heart,
  Info,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { useI18n } from "../../../i18n";
import styles from "./BatchActionBar.module.css";

function ActionButton({ Icon, label, variant = "default", active = false, ...props }) {
  const classNames = [
    styles.actionButton,
    styles[variant],
    active ? styles.active : "",
  ].filter(Boolean).join(" ");

  return (
    <button className={classNames} type="button" {...props}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default function BatchActionBar({
  currentView = "albums",
  selectedCount = 0,
  totalCount = 0,
  compareActive = false,
  onFavorite,
  onInspect,
  onCompare,
  onMove,
  onAddTag,
  onExport,
  onDelete,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
}) {
  const { t } = useI18n();
  const isTrash = currentView === "trash";
  const hasSelection = selectedCount > 0;

  if ((!isTrash && !hasSelection) || (isTrash && totalCount === 0)) return null;

  return (
    <section className={styles.bar} aria-label={t("batch.actions")} aria-live="polite">
      <strong className={styles.summary}>
        {hasSelection
          ? t("batch.selected", { count: selectedCount })
          : t("batch.trashTotal", { count: totalCount })}
      </strong>

      <div className={styles.actions}>
        {isTrash ? (
          <>
            <ActionButton
              Icon={Info}
              label={t("batch.inspect")}
              onClick={onInspect}
              disabled={!hasSelection}
              title={t("batch.inspectTitle")}
            />
            <ActionButton
              Icon={RotateCcw}
              label={t("batch.restore")}
              variant="success"
              onClick={onRestore}
              disabled={!hasSelection}
              title={t("batch.restoreTitle")}
            />
            <ActionButton
              Icon={Trash2}
              label={t("common.deletePermanently")}
              variant="danger"
              onClick={onPermanentDelete}
              disabled={!hasSelection}
              title={t("batch.permanentDeleteTitle")}
            />
            <span className={styles.separator} aria-hidden="true" />
            <ActionButton
              Icon={Eraser}
              label={t("batch.emptyTrash")}
              variant="dangerSubtle"
              onClick={onEmptyTrash}
              title={t("batch.emptyTrashTitle")}
            />
          </>
        ) : (
          <>
            <ActionButton Icon={Info} label={t("batch.inspect")} onClick={onInspect} title={t("batch.inspectTitle")} />
            <ActionButton Icon={Heart} label={t("batch.favorite")} onClick={onFavorite} title={t("batch.favoriteTitle")} />
            <ActionButton
              Icon={Columns2}
              label={t("batch.compare")}
              active={compareActive}
              onClick={onCompare}
              aria-pressed={compareActive}
              title={compareActive ? t("timeline.exitCompare") : t("batch.compareTitle")}
            />
            <ActionButton Icon={FolderInput} label={t("batch.move")} onClick={onMove} title={t("batch.moveTitle")} />
            <ActionButton Icon={Tag} label={t("batch.tag")} onClick={onAddTag} title={t("batch.tagTitle")} />
            <ActionButton Icon={Download} label={t("batch.export")} onClick={onExport} title={t("batch.exportTitle")} />
            <ActionButton Icon={Trash2} label={t("common.delete")} variant="danger" onClick={onDelete} title={t("photo.moveToTrash")} />
          </>
        )}
      </div>
    </section>
  );
}
