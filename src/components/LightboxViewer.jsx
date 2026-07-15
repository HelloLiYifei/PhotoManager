import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { loadPathThumbnail, loadPhotoThumbnail } from "../lib/thumbnailLoader";
import { loadPathPreview, loadPhotoPreview, prefetchPhotoPreview } from "../lib/previewLoader";
import {
  addTagToPhoto,
  deletePhoto,
  getPhotoTags,
  permanentlyDeletePhoto,
  removeTagFromPhoto,
  toggleFavorite,
  updateRating,
} from "../services/photoService";
import { Drawer, useGlobalDialog } from "./ui";
import {
  LightboxCanvas,
  LightboxInfoPanel,
  LightboxToolbar,
  useNarrowLightbox,
} from "./lightbox";
import { lightboxStyles as styles } from "../themes/classNames";

const clampZoom = (value) => Math.min(8, Math.max(0.25, value));

function importPhotoForDisplay(photo) {
  const pathParts = photo.relativePath?.split(/[/\\]/) || [];
  return {
    ...photo,
    id: photo.absolutePath,
    filename: pathParts.at(-1) || photo.absolutePath,
    path: photo.absolutePath,
    fileSize: photo.size,
  };
}

export default function LightboxViewer({
  photosList,
  initialIndex,
  onClose,
  onPhotosUpdated,
  onShowOnMap,
  mode = "library",
  importAlbums = [],
  getImportPhotoState,
  onSetImportAlbum,
}) {
  const { t } = useI18n();
  const { alert: showAlert, confirm: showConfirm } = useGlobalDialog();
  const safeInitialIndex = Math.min(Math.max(initialIndex ?? 0, 0), Math.max(photosList.length - 1, 0));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const currentPhoto = photosList[currentIndex];
  const isImportMode = mode === "import";
  const displayPhoto = isImportMode && currentPhoto
    ? importPhotoForDisplay(currentPhoto)
    : currentPhoto;
  const importPhotoState = isImportMode && currentPhoto
    ? getImportPhotoState?.(currentPhoto) || {}
    : null;
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

    const thumbnailRequest = isImportMode
      ? loadPathThumbnail(currentPhoto.absolutePath, Boolean(currentPhoto.isRaw))
      : loadPhotoThumbnail(currentPhoto.id);
    const previewRequest = isImportMode
      ? loadPathPreview(currentPhoto.absolutePath, Boolean(currentPhoto.isRaw))
      : loadPhotoPreview(currentPhoto.id);

    thumbnailRequest
      .then((url) => {
        if (active) setThumbnailSrc(url);
      })
      .catch(() => {});

    previewRequest
      .then((url) => {
        if (active) setPreviewSrc(url);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        setPreviewError(t("lightbox.previewLoadError"));
        setLoading(false);
      });

    if (!isImportMode) {
      prefetchPhotoPreview(photosList[currentIndex - 1]?.id);
      prefetchPhotoPreview(photosList[currentIndex + 1]?.id);
    }

    return () => {
      active = false;
    };
  }, [currentIndex, currentPhoto, isImportMode, loadRevision, photosList, resetTransform, t]);

  useEffect(() => {
    if (!currentPhoto) return undefined;
    if (isImportMode) {
      setPhotoTags([]);
      setTagInput("");
      setRating(0);
      setFavorite(false);
      return undefined;
    }
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
  }, [currentPhoto, isImportMode]);

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
      await showAlert(isTrash ? t("photo.restored") : t("photo.movedToTrash"), {
        title: isTrash ? t("photo.restoreDone") : t("photo.movedToTrashTitle"),
        tone: "success",
      });
      advanceAfterRemoval();
    } catch (error) {
      await showAlert(t("common.operationFailedMessage", { message: error }), { title: t("common.operationFailed"), tone: "danger" });
    } finally {
      setPendingAction("");
    }
  };

  const handlePermanentDelete = async () => {
    if (!currentPhoto || pendingAction) return;
    const confirmed = await showConfirm(
      t("photo.permanentDeleteConfirm"),
      {
        title: t("photo.permanentDeleteTitle"),
        tone: "danger",
        confirmText: t("common.deletePermanently"),
      },
    );
    if (!confirmed) return;
    setPendingAction("delete");
    try {
      await permanentlyDeletePhoto({ id: currentPhoto.id });
      await showAlert(t("photo.permanentlyDeleted"), { title: t("photo.deleteDone"), tone: "success" });
      advanceAfterRemoval();
    } catch (error) {
      await showAlert(t("photo.deleteFailedMessage", { message: error }), { title: t("photo.deleteFailed"), tone: "danger" });
    } finally {
      setPendingAction("");
    }
  };

  const handleImportAlbumChange = (albumName) => {
    if (!isImportMode || !currentPhoto || currentPhoto.alreadyImported) return;
    onSetImportAlbum?.(currentPhoto, albumName);
  };

  if (!currentPhoto) return null;

  const infoPanel = (
    <LightboxInfoPanel
      photo={displayPhoto}
      tags={photoTags}
      tagInput={tagInput}
      onTagInputChange={setTagInput}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
      onShowOnMap={onShowOnMap}
      disabled={Boolean(pendingAction)}
      showTags={!isImportMode}
      showMapAction={!isImportMode}
    />
  );

  return (
    <div
      className={`${styles.overlay} ${isImportMode ? styles.importOverlay : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={isImportMode ? t("lightbox.importPreview") : t("lightbox.photoPreview")}
    >
      <main className={styles.main}>
        <LightboxCanvas
          photo={displayPhoto}
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
          mode={mode}
          importAlbums={importAlbums}
          importTargetAlbum={importPhotoState?.targetAlbum || null}
          importTargetColor={importPhotoState?.albumColor || "transparent"}
          importColorDisabled={Boolean(currentPhoto.alreadyImported)}
          onImportAlbumChange={handleImportAlbumChange}
        />
      </main>

      {!isNarrow && detailsOpen && (
        <aside className={styles.detailsDock} aria-label={t("lightbox.photoInfo")}>
          {infoPanel}
        </aside>
      )}

      {isNarrow && (
        <Drawer
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title={t("lightbox.photoInfo")}
          description={isImportMode ? t("lightbox.importInfoDescription") : t("lightbox.infoDescription")}
          side="right"
          closeDisabled={Boolean(pendingAction)}
        >
          {infoPanel}
        </Drawer>
      )}
    </div>
  );
}
