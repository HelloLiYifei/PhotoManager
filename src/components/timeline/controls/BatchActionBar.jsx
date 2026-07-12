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
  const isTrash = currentView === "trash";
  const hasSelection = selectedCount > 0;

  if ((!isTrash && !hasSelection) || (isTrash && totalCount === 0)) return null;

  return (
    <section className={styles.bar} aria-label="批量操作" aria-live="polite">
      <strong className={styles.summary}>
        {hasSelection ? `已选择 ${selectedCount} 张照片` : `垃圾桶共 ${totalCount} 张照片`}
      </strong>

      <div className={styles.actions}>
        {isTrash ? (
          <>
            <ActionButton
              Icon={Info}
              label="属性"
              onClick={onInspect}
              disabled={!hasSelection}
              title="查看所选照片的属性"
            />
            <ActionButton
              Icon={RotateCcw}
              label="还原"
              variant="success"
              onClick={onRestore}
              disabled={!hasSelection}
              title="将所选照片还原到图库"
            />
            <ActionButton
              Icon={Trash2}
              label="永久删除"
              variant="danger"
              onClick={onPermanentDelete}
              disabled={!hasSelection}
              title="永久删除所选照片"
            />
            <span className={styles.separator} aria-hidden="true" />
            <ActionButton
              Icon={Eraser}
              label="清空垃圾桶"
              variant="dangerSubtle"
              onClick={onEmptyTrash}
              title="永久删除垃圾桶内的全部照片"
            />
          </>
        ) : (
          <>
            <ActionButton Icon={Info} label="属性" onClick={onInspect} title="查看所选照片的属性" />
            <ActionButton Icon={Heart} label="收藏" onClick={onFavorite} title="切换所选照片的收藏状态" />
            <ActionButton
              Icon={Columns2}
              label="对比"
              active={compareActive}
              onClick={onCompare}
              aria-pressed={compareActive}
              title={compareActive ? "退出照片对比" : "以所选照片作为对比基准"}
            />
            <ActionButton Icon={FolderInput} label="移动" onClick={onMove} title="移动到其他相册" />
            <ActionButton Icon={Tag} label="贴标" onClick={onAddTag} title="为所选照片添加标签" />
            <ActionButton Icon={Download} label="导出" onClick={onExport} title="导出到外部文件夹" />
            <ActionButton Icon={Trash2} label="删除" variant="danger" onClick={onDelete} title="移入垃圾桶" />
          </>
        )}
      </div>
    </section>
  );
}
