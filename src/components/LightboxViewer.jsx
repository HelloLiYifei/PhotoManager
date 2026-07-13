import { useCallback, useEffect, useRef, useState } from "react";
import { loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { loadPhotoPreview, prefetchPhotoPreview } from "../lib/previewLoader";
import {
  addTagToPhoto,
  deletePhoto,
  getPhotoTags,
  permanentlyDeletePhoto,
  removeTagFromPhoto,
  toggleFavorite,
  updateRating,
} from "../services/photoService";
import { Drawer } from "./ui";
import {
  LightboxCanvas,
  LightboxInfoPanel,
  LightboxToolbar,
  useNarrowLightbox,
} from "./lightbox";
import styles from "./lightbox/Lightbox.module.css";

const clampZoom = (value) => Math.min(8, Math.max(0.25, value));

export default function LightboxViewer({
  photosList,
  initialIndex,
  onClose,
  onPhotosUpdated,
  onShowOnMap,
}) {
  const safeInitialIndex = Math.min(Math.max(initialIndex ?? 0, 0), Math.max(photosList.length - 1, 0));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const currentPhoto = photosList[currentIndex];
  const isNarrow = useNarrowLightbox();
  const [detailsOpen, setDetailsOpen] = useState(() => !isNarrow);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [thumbnailSrc, setThumbnailSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [photoTags, setPhotoTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [rating, setRating] = useState(currentPhoto?.rating ?? 0);
  const [favorite, setFavorite] = useState(Boolean(currentPhoto?.isFavorite));
  const [pendingAction, setPendingAction] = useState("");
  const dragStateRef = useRef(null);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragStateRef.current = null;
  }, []);

  const setZoomLevel = useCallback((nextValue) => {
    setZoom((current) => {
      const requested = typeof nextValue === "function" ? nextValue(current) : nextValue;
      const next = clampZoom(requested);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const changeZoom = useCallback((delta) => {
    setZoomLevel((current) => Math.round((current + delta) * 100) / 100);
  }, [setZoomLevel]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((index) => Math.min(photosList.length - 1, index + 1));
  }, [photosList.length]);

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(photosList.length - 1, 0)));
  }, [photosList.length]);

  useEffect(() => {
    if (!currentPhoto) return undefined;
    let active = true;
    setLoading(true);
    setPreviewError("");
    setPreviewSrc(null);
    setThumbnailSrc(null);
    resetTransform();

    loadPhotoThumbnail(currentPhoto.id)
      .then((url) => {
        if (active) setThumbnailSrc(url);
      })
      .catch(() => {});

    loadPhotoPreview(currentPhoto.id)
      .then((url) => {
        if (active) setPreviewSrc(url);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        setPreviewError("无法载入这张照片的预览");
        setLoading(false);
      });

    prefetchPhotoPreview(photosList[currentIndex - 1]?.id);
    prefetchPhotoPreview(photosList[currentIndex + 1]?.id);

    return () => {
      active = false;
    };
  }, [currentIndex, currentPhoto, loadRevision, photosList, resetTransform]);

  useEffect(() => {
    if (!currentPhoto) return undefined;
    let active = true;
    setPhotoTags([]);
    setTagInput("");
    setRating(currentPhoto.rating ?? 0);
    setFavorite(Boolean(currentPhoto.isFavorite));
    getPhotoTags({ photoId: currentPhoto.id })
      .then((tags) => {
        if (active) setPhotoTags(tags);
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [currentPhoto]);

  useEffect(() => {
    setDetailsOpen(!isNarrow);
  }, [isNarrow]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (isTyping) {
        if (event.key === "Escape") event.target.blur();
        return;
      }
      if (event.key === "ArrowLeft" && !pendingAction) handlePrev();
      else if (event.key === "ArrowRight" && !pendingAction) handleNext();
      else if (event.key === "Escape") {
        if (isNarrow && detailsOpen) setDetailsOpen(false);
        else onClose();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(0.25);
      } else if (event.key === "-") {
        event.preventDefault();
        changeZoom(-0.25);
      } else if (event.key === "0") {
        event.preventDefault();
        resetTransform();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeZoom, detailsOpen, handleNext, handlePrev, isNarrow, onClose, pendingAction, resetTransform]);

  const handleWheel = (event) => {
    event.preventDefault();
    setZoomLevel((current) => current * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || zoom <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current) return;
    setPan({
      x: dragStateRef.current.originX + event.clientX - dragStateRef.current.startX,
      y: dragStateRef.current.originY + event.clientY - dragStateRef.current.startY,
    });
  };

  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom === 1) setZoomLevel(2);
    else resetTransform();
  };

  const handleToggleFavorite = async () => {
    if (!currentPhoto || pendingAction) return;
    const nextFavorite = !favorite;
    setPendingAction("favorite");
    try {
      await toggleFavorite({ id: currentPhoto.id, isFavorite: nextFavorite });
      setFavorite(nextFavorite);
      onPhotosUpdated?.();
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction("");
    }
  };

  const handleRatingChange = async (nextRating) => {
    if (!currentPhoto || pendingAction) return;
    setPendingAction("rating");
    try {
      await updateRating({ id: currentPhoto.id, rating: nextRating });
      setRating(nextRating);
      onPhotosUpdated?.();
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction("");
    }
  };

  const handleAddTag = async (event) => {
    event.preventDefault();
    const tagName = tagInput.trim();
    if (!tagName || !currentPhoto || photoTags.includes(tagName) || pendingAction) return;
    setPendingAction("tag");
    try {
      await addTagToPhoto({ photoId: currentPhoto.id, tagName });
      setPhotoTags((tags) => [...tags, tagName]);
      setTagInput("");
      onPhotosUpdated?.();
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction("");
    }
  };

  const handleRemoveTag = async (tagName) => {
    if (!currentPhoto || pendingAction) return;
    setPendingAction("tag");
    try {
      await removeTagFromPhoto({ photoId: currentPhoto.id, tagName });
      setPhotoTags((tags) => tags.filter((tag) => tag !== tagName));
      onPhotosUpdated?.();
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction("");
    }
  };

  const advanceAfterRemoval = () => {
    onPhotosUpdated?.();
    if (photosList.length <= 1) onClose();
    else if (currentIndex < photosList.length - 1) handleNext();
    else handlePrev();
  };

  const handleDelete = async () => {
    if (!currentPhoto || pendingAction) return;
    const isTrash = Boolean(currentPhoto.isDeleted);
    setPendingAction("delete");
    try {
      await deletePhoto({ id: currentPhoto.id, isDeleted: !isTrash });
      window.alert(isTrash ? "照片已恢复" : "照片已移动到回收站");
      advanceAfterRemoval();
    } catch (error) {
      window.alert(`操作失败: ${error}`);
    } finally {
      setPendingAction("");
    }
  };

  const handlePermanentDelete = async () => {
    if (!currentPhoto || pendingAction) return;
    if (!window.confirm("此操作将永久从磁盘删除照片文件，且不可恢复！确定吗？")) return;
    setPendingAction("delete");
    try {
      await permanentlyDeletePhoto({ id: currentPhoto.id });
      window.alert("照片已永久删除");
      advanceAfterRemoval();
    } catch (error) {
      window.alert(`删除失败: ${error}`);
    } finally {
      setPendingAction("");
    }
  };

  if (!currentPhoto) return null;

  const infoPanel = (
    <LightboxInfoPanel
      photo={currentPhoto}
      tags={photoTags}
      tagInput={tagInput}
      onTagInputChange={setTagInput}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
      onShowOnMap={onShowOnMap}
      disabled={Boolean(pendingAction)}
    />
  );

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="照片预览">
      <main className={styles.main}>
        <LightboxCanvas
          photo={currentPhoto}
          previewSrc={previewSrc}
          thumbnailSrc={thumbnailSrc}
          loading={loading}
          error={previewError}
          zoom={zoom}
          pan={pan}
          isDragging={isDragging}
          canGoPrevious={currentIndex > 0}
          canGoNext={currentIndex < photosList.length - 1}
          navigationDisabled={Boolean(pendingAction)}
          onPrevious={handlePrev}
          onNext={handleNext}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onLoaded={() => setLoading(false)}
          onRetry={() => setLoadRevision((revision) => revision + 1)}
        />
        <LightboxToolbar
          zoom={zoom}
          pan={pan}
          rating={rating}
          favorite={favorite}
          isDeleted={Boolean(currentPhoto.isDeleted)}
          detailsOpen={detailsOpen}
          busy={Boolean(pendingAction)}
          onClose={onClose}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
          onZoomOut={() => changeZoom(-0.25)}
          onZoomIn={() => changeZoom(0.25)}
          onResetZoom={resetTransform}
          onRatingChange={handleRatingChange}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
          onPermanentDelete={handlePermanentDelete}
        />
      </main>

      {!isNarrow && detailsOpen && (
        <aside className={styles.detailsDock} aria-label="照片信息">
          {infoPanel}
        </aside>
      )}

      {isNarrow && (
        <Drawer
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title="照片信息"
          description="查看拍摄参数、文件信息与标签"
          side="right"
          closeDisabled={Boolean(pendingAction)}
        >
          {infoPanel}
        </Drawer>
      )}
    </div>
  );
}
