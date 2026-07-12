import { useCallback, useRef, useState } from "react";

import { movePhotosToAlbum } from "../../../services/albumService";
import {
  addTagToPhoto,
  deletePhoto,
  emptyTrashToRecycleBin,
  exportPhotos,
  permanentlyDeletePhotos,
  restorePhotos,
  toggleFavorite,
  updateRating,
} from "../../../services/photoService";
import { selectDirectory } from "../../../services/workspaceService";

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export default function useTimelineActions({
  currentView,
  photos,
  selectedIds,
  primaryPhoto,
  clearSelection,
  reloadPhotos,
  reloadAllTags,
  reloadPrimaryTags,
  onPhotosUpdated,
}) {
  const [activeAction, setActiveAction] = useState(null);
  const activeActionRef = useRef(null);

  const runAction = useCallback(async (name, action) => {
    if (activeActionRef.current) return false;
    activeActionRef.current = name;
    setActiveAction(name);
    try {
      const result = await action();
      return result ?? true;
    } finally {
      activeActionRef.current = null;
      setActiveAction(null);
    }
  }, []);

  const finishMutation = useCallback(async ({ clear = false } = {}) => {
    if (clear) clearSelection();
    await reloadPhotos();
    onPhotosUpdated?.();
  }, [clearSelection, onPhotosUpdated, reloadPhotos]);

  const favoriteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await runAction("favorite", async () => {
      try {
        const first = photos.find((photo) => photo.id === selectedIds[0]);
        const isFavorite = first ? !first.isFavorite : true;
        await Promise.all(selectedIds.map((id) => toggleFavorite({ id, isFavorite })));
        await finishMutation();
      } catch (error) {
        window.alert(`更新收藏失败：${describeError(error)}`);
        return false;
      }
    });
  }, [finishMutation, photos, runAction, selectedIds]);

  const ratePhoto = useCallback(async (rating) => {
    if (!primaryPhoto) return;
    await runAction("rating", async () => {
      try {
        await updateRating({ id: primaryPhoto.id, rating });
        await finishMutation();
      } catch (error) {
        window.alert(`更新评分失败：${describeError(error)}`);
        return false;
      }
    });
  }, [finishMutation, primaryPhoto, runAction]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;

    if (currentView === "trash") {
      const accepted = window.confirm(
        `确定要将选中的 ${selectedIds.length} 张照片移至操作系统回收站吗？物理文件会被删除。`,
      );
      if (!accepted) return;

      await runAction("delete", async () => {
        try {
          await permanentlyDeletePhotos({ ids: selectedIds });
          await finishMutation({ clear: true });
        } catch (error) {
          window.alert(`移至系统回收站失败：${describeError(error)}`);
        }
      });
      return;
    }

    await runAction("delete", async () => {
      try {
        await Promise.all(selectedIds.map((id) => deletePhoto({ id, isDeleted: true })));
        await finishMutation({ clear: true });
      } catch (error) {
        window.alert(`移入垃圾桶失败：${describeError(error)}`);
        return false;
      }
    });
  }, [currentView, finishMutation, runAction, selectedIds]);

  const restoreSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await runAction("restore", async () => {
      try {
        await restorePhotos({ ids: selectedIds });
        await finishMutation({ clear: true });
      } catch (error) {
        window.alert(`还原失败：${describeError(error)}`);
      }
    });
  }, [finishMutation, runAction, selectedIds]);

  const emptyTrash = useCallback(async () => {
    const accepted = window.confirm(
      "确定要清空垃圾桶吗？全部物理文件会移至系统回收站，数据库记录会被删除。",
    );
    if (!accepted) return;

    await runAction("empty-trash", async () => {
      try {
        await emptyTrashToRecycleBin();
        await finishMutation({ clear: true });
        window.alert("垃圾桶已清空，文件已移至系统回收站。");
      } catch (error) {
        window.alert(`清空失败：${describeError(error)}`);
      }
    });
  }, [finishMutation, runAction]);

  const moveSelected = useCallback(async (targetAlbumId) => {
    if (selectedIds.length === 0) return false;
    return runAction("move", async () => {
      try {
        await movePhotosToAlbum({ photoIds: selectedIds, targetAlbumId });
        await finishMutation({ clear: true });
        window.alert("照片移动完成。");
      } catch (error) {
        window.alert(`移动失败：${describeError(error)}`);
        return false;
      }
    });
  }, [finishMutation, runAction, selectedIds]);

  const tagSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const value = window.prompt("请输入要为选中照片添加的标签：");
    const tagName = value?.trim();
    if (!tagName) return;

    await runAction("tag", async () => {
      try {
        await Promise.all(selectedIds.map((id) => addTagToPhoto({ photoId: id, tagName })));
        if (primaryPhoto) await reloadPrimaryTags(primaryPhoto.id);
        await reloadAllTags();
        window.alert("标签添加成功。");
      } catch (error) {
        window.alert(`添加标签失败：${describeError(error)}`);
        return false;
      }
    });
  }, [primaryPhoto, reloadAllTags, reloadPrimaryTags, runAction, selectedIds]);

  const exportSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await runAction("export", async () => {
      try {
        const destDir = await selectDirectory();
        if (!destDir) return false;
        await exportPhotos({ photoIds: selectedIds, destDir });
        window.alert("导出成功。");
      } catch (error) {
        window.alert(`导出失败：${describeError(error)}`);
      }
    });
  }, [runAction, selectedIds]);

  return {
    activeAction,
    deleteSelected,
    emptyTrash,
    exportSelected,
    favoriteSelected,
    moveSelected,
    ratePhoto,
    restoreSelected,
    tagSelected,
  };
}
