import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle, RefreshCw, X } from "lucide-react";

import { getAlbums } from "../services/albumService";
import { useI18n } from "../i18n";
import {
  BatchActionBar,
  MoveAlbumDialog,
  PhotoInspector,
  TimelineToolbar,
} from "./timeline/controls";
import {
  usePhotoList,
  usePhotoMetadata,
  usePhotoSelection,
  usePhotoViewPreference,
  useTimelineActions,
} from "./timeline/hooks";
import { ComparePreviewImage } from "./timeline/media";
import { GalleryView, ListView, MasonryView } from "./timeline/views";
import { useGlobalDialog } from "./ui";
import styles from "./TimelineGrid.module.css";

const NARROW_TIMELINE_QUERY = "(max-width: 900px)";

function errorMessage(error) {
  if (!error) return "";
  return error instanceof Error ? error.message : String(error);
}

function readNarrowTimeline() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia(NARROW_TIMELINE_QUERY).matches;
}

function useNarrowTimeline() {
  const [isNarrow, setIsNarrow] = useState(readNarrowTimeline);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(NARROW_TIMELINE_QUERY);
    const handleChange = (event) => setIsNarrow(event.matches);
    setIsNarrow(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  return isNarrow;
}

export default function TimelineGrid({
  workspace,
  currentView,
  albumId,
  onPhotoClick,
  onPhotosUpdated,
  refreshTrigger,
}) {
  const { alert: showAlert } = useGlobalDialog();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewMode, setViewMode] = usePhotoViewPreference(workspace);
  const [newTagInput, setNewTagInput] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareLockedId, setCompareLockedId] = useState(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveAlbums, setMoveAlbums] = useState([]);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState(null);
  const gridScrollRef = useRef(null);
  const isNarrow = useNarrowTimeline();

  const {
    photos,
    loading,
    error,
    retry,
    reload: reloadPhotos,
    debouncedSearchQuery,
  } = usePhotoList({
    currentView,
    albumId,
    ratingFilter,
    tagFilter,
    searchQuery,
    refreshTrigger,
  });

  const {
    selectedIds,
    primaryPhoto,
    clearSelection,
    selectOnly,
    handlePhotoSelect,
  } = usePhotoSelection(photos);

  const {
    addPrimaryTag,
    allTags,
    primaryTags,
    reloadAllTags,
    reloadPrimaryTags,
    removePrimaryTag,
  } = usePhotoMetadata(primaryPhoto?.id);

  const actions = useTimelineActions({
    currentView,
    photos,
    selectedIds,
    primaryPhoto,
    clearSelection,
    reloadPhotos,
    reloadAllTags,
    reloadPrimaryTags,
    onPhotosUpdated,
  });

  const primaryPhotoId = primaryPhoto?.id;

  useEffect(() => {
    setInspectorOpen(Boolean(primaryPhotoId) && !isNarrow);
  }, [isNarrow, primaryPhotoId]);

  useEffect(() => {
    clearSelection();
    setCompareMode(false);
    setCompareLockedId(null);
    setFiltersOpen(false);
  }, [
    albumId,
    clearSelection,
    currentView,
    debouncedSearchQuery,
    ratingFilter,
    tagFilter,
  ]);

  useEffect(() => {
    if (
      compareMode &&
      !photos.some((photo) => photo.id === compareLockedId)
    ) {
      setCompareMode(false);
      setCompareLockedId(null);
    }
  }, [compareLockedId, compareMode, photos]);

  const openPhoto = useCallback((photoList, index) => {
    onPhotoClick?.(photoList, index);
  }, [onPhotoClick]);

  const selectGalleryPhoto = useCallback((photo, event) => {
    event?.stopPropagation?.();
    if (event?.ctrlKey || event?.metaKey) {
      handlePhotoSelect(photo, event);
      return;
    }
    selectOnly(photo);
  }, [handlePhotoSelect, selectOnly]);

  const changeViewMode = useCallback((mode) => {
    setViewMode(mode);
    if (mode !== "masonry") {
      setCompareMode(false);
      setCompareLockedId(null);
    }
  }, [setViewMode]);

  const toggleCompare = useCallback(() => {
    if (compareMode) {
      setCompareMode(false);
      setCompareLockedId(null);
      return;
    }

    if (selectedIds.length === 0) {
      void showAlert(t("timeline.compareSelect"), {
        title: t("timeline.compareSelectTitle"),
        tone: "warning",
      });
      return;
    }

    setViewMode("masonry");
    setCompareLockedId(selectedIds.at(-1));
    setCompareMode(true);
  }, [compareMode, selectedIds, setViewMode, showAlert, t]);

  const addTag = useCallback(async () => {
    try {
      const added = await addPrimaryTag(newTagInput);
      if (added) setNewTagInput("");
    } catch (caught) {
      void showAlert(t("timeline.addTagFailed", { message: errorMessage(caught) }), {
        title: t("timeline.addTagFailedTitle"),
        tone: "danger",
      });
    }
  }, [addPrimaryTag, newTagInput, showAlert, t]);

  const removeTag = useCallback(async (tagName) => {
    try {
      await removePrimaryTag(tagName);
    } catch (caught) {
      void showAlert(t("timeline.removeTagFailed", { message: errorMessage(caught) }), {
        title: t("timeline.removeTagFailedTitle"),
        tone: "danger",
      });
    }
  }, [removePrimaryTag, showAlert, t]);

  const openMoveDialog = useCallback(async () => {
    setMoveError(null);
    try {
      const albums = await getAlbums();
      setMoveAlbums(albums);
      setMoveDialogOpen(true);
    } catch (caught) {
      void showAlert(t("timeline.readAlbumsFailed", { message: errorMessage(caught) }), {
        title: t("timeline.readAlbumsFailedTitle"),
        tone: "danger",
      });
    }
  }, [showAlert, t]);

  const moveToAlbum = useCallback(async (targetAlbumId) => {
    setMoveBusy(true);
    setMoveError(null);
    try {
      const moved = await actions.moveSelected(targetAlbumId);
      if (moved) setMoveDialogOpen(false);
    } catch (caught) {
      setMoveError(caught);
    } finally {
      setMoveBusy(false);
    }
  }, [actions]);

  const showBatchActions =
    selectedIds.length > 0 || (currentView === "trash" && photos.length > 0);

  const batchActionBar = (
    <BatchActionBar
      currentView={currentView}
      selectedCount={selectedIds.length}
      totalCount={photos.length}
      compareActive={compareMode}
      onInspect={() => setInspectorOpen(true)}
      onFavorite={actions.favoriteSelected}
      onCompare={toggleCompare}
      onMove={openMoveDialog}
      onAddTag={actions.tagSelected}
      onExport={actions.exportSelected}
      onDelete={actions.deleteSelected}
      onRestore={actions.restoreSelected}
      onPermanentDelete={actions.deleteSelected}
      onEmptyTrash={actions.emptyTrash}
    />
  );

  let photoView = null;
  if (viewMode === "list") {
    photoView = (
      <ListView
        photos={photos}
        selectedIds={selectedIds}
        scrollRoot={gridScrollRef}
        onSelect={handlePhotoSelect}
        onOpen={openPhoto}
      />
    );
  } else if (viewMode === "gallery") {
    photoView = (
      <GalleryView
        photos={photos}
        activePhoto={primaryPhoto || photos[0]}
        selectedIds={selectedIds}
        scrollRoot={gridScrollRef}
        actionToolbar={showBatchActions ? batchActionBar : null}
        onSelect={selectGalleryPhoto}
        onOpen={openPhoto}
      />
    );
  } else {
    photoView = (
      <MasonryView
        photos={photos}
        selectedIds={selectedIds}
        compareLockedId={compareLockedId}
        scrollRoot={gridScrollRef}
        onSelect={handlePhotoSelect}
        onOpen={openPhoto}
      />
    );
  }

  return (
    <section
      className={`${styles.viewport} animate-fade-in`}
      aria-label={t("timeline.browser")}
      aria-busy={loading}
      data-view-mode={viewMode}
    >
      <TimelineToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allTags={allTags}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        ratingFilter={ratingFilter}
        onRatingFilterChange={setRatingFilter}
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
      />

      {error && photos.length > 0 ? (
        <div className={styles.inlineError} role="alert">
          <span>{errorMessage(error)}</span>
          <button type="button" onClick={retry}>
            <RefreshCw aria-hidden="true" />
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      <div className={styles.content}>
        <div
          ref={gridScrollRef}
          className={styles.scrollArea}
          tabIndex={-1}
        >
          {loading && photos.length === 0 ? (
            <div className={styles.state} role="status">
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
              <strong>{t("timeline.loading")}</strong>
              <span>{t("timeline.loadingDescription")}</span>
            </div>
          ) : error && photos.length === 0 ? (
            <div className={styles.state} role="alert">
              <ImageOff aria-hidden="true" />
              <strong>{t("timeline.loadFailed")}</strong>
              <span>{errorMessage(error)}</span>
              <button type="button" onClick={retry}>
                <RefreshCw aria-hidden="true" />
                {t("common.retry")}
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className={styles.state} role="status">
              <ImageOff aria-hidden="true" />
              <strong>{searchQuery || tagFilter || ratingFilter ? t("timeline.noMatches") : t("timeline.noPhotos")}</strong>
              <span>{searchQuery || tagFilter || ratingFilter ? t("timeline.adjustFilters") : t("timeline.importHint")}</span>
            </div>
          ) : compareMode ? (
            <div className={styles.compareLayout}>
              <div className={styles.compareBrowser}>{photoView}</div>
              <section className={styles.comparePreview} aria-label={t("timeline.compareBaseline")}>
                <button
                  type="button"
                  className={styles.compareClose}
                  onClick={toggleCompare}
                  aria-label={t("timeline.exitCompare")}
                >
                  <X aria-hidden="true" />
                  {t("timeline.exitCompareText")}
                </button>
                <ComparePreviewImage id={compareLockedId} />
                <strong>{t("timeline.lockedBaseline")}</strong>
              </section>
            </div>
          ) : photoView}
        </div>

        <PhotoInspector
          photo={inspectorOpen ? primaryPhoto : null}
          tags={primaryTags}
          newTagInput={newTagInput}
          onNewTagInputChange={setNewTagInput}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onRatingChange={actions.ratePhoto}
          onClose={() => setInspectorOpen(false)}
        />
      </div>

      {viewMode !== "gallery" ? batchActionBar : null}

      <MoveAlbumDialog
        open={moveDialogOpen}
        albums={moveAlbums}
        selectedCount={selectedIds.length}
        busy={moveBusy || actions.activeAction === "move"}
        error={moveError}
        onSelect={moveToAlbum}
        onClose={() => setMoveDialogOpen(false)}
      />
    </section>
  );
}
