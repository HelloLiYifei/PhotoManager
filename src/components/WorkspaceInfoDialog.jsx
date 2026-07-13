import { Database, FolderOpen } from "lucide-react";

import { Button, Dialog } from "./ui";
import styles from "./WorkspaceInfoDialog.module.css";

export default function WorkspaceInfoDialog({
  open,
  onClose,
  workspace,
  closeDisabled = false,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="工作区信息"
      description="当前照片工作区的位置与存储方式。"
      closeDisabled={closeDisabled}
      footer={
        <Button
          type="button"
          variant="primary"
          onClick={onClose}
          disabled={closeDisabled}
        >
          知道了
        </Button>
      }
    >
      <dl className={styles.details}>
        <div className={styles.row}>
          <dt>名称</dt>
          <dd>{workspace?.name || "未命名工作区"}</dd>
        </div>
        <div className={styles.row}>
          <dt>
            <FolderOpen size={15} aria-hidden="true" />
            路径
          </dt>
          <dd className={styles.path}>{workspace?.path || "—"}</dd>
        </div>
        <div className={styles.row}>
          <dt>
            <Database size={15} aria-hidden="true" />
            存储格式
          </dt>
          <dd>物理目录直接映射</dd>
        </div>
      </dl>
      <p className={styles.note}>
        PhotoManager 直接整理此目录中的照片，不会将原文件封装到专有图库格式中。
      </p>
    </Dialog>
  );
}
