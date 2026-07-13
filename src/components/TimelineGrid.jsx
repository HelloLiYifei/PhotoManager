import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle, RefreshCw, X } from "lucide-react";

import { getAlbums } from "../services/albumService";
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
  currentView,
  albumId,
  onPhotoClick,
  onPhotosUpdated,
  refreshTrigger,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewMode, setViewMode] = usePhotoViewPreference();
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
      window.alert("请先选择一张照片作为对比基准。");
      return;
    }

    setViewMode("masonry");
    setCompareLockedId(selectedIds.at(-1));
    setCompareMode(true);
  }, [compareMode, selectedIds, setViewMode]);

  const addTag = useCallback(async () => {
    try {
      const added = await addPrimaryTag(newTagInput);
      if (added) setNewTagInput("");
    } catch (caught) {
      window.alert(`添加标签失败：${errorMessage(caught)}`);
    }
  }, [addPrimaryTag, newTagInput]);

  const removeTag = useCallback(async (tagName) => {
    try {
      await removePrimaryTag(tagName);
    } catch (caught) {
      window.alert(`删除标签失败：${errorMessage(caught)}`);
    }
  }, [removePrimaryTag]);

  const openMoveDialog = useCallback(async () => {
    setMoveError(null);
    try {
      const albums = await getAlbums();
      setMoveAlbums(albums);
      setMoveDialogOpen(true);
    } catch (caught) {
      window.alert(`读取相册失败：${errorMessage(caught)}`);
    }
  }, []);

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
        hasActionToolbar={showBatchActions}
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
      aria-label="照片浏览器"
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
            重试
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
              <strong>正在加载照片</strong>
              <span>正在读取当前视图的照片信息…</span>
            </div>
          ) : error && photos.length === 0 ? (
            <div className={styles.state} role="alert">
              <ImageOff aria-hidden="true" />
              <strong>照片加载失败</strong>
              <span>{errorMessage(error)}</span>
              <button type="button" onClick={retry}>
                <RefreshCw aria-hidden="true" />
                重试
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className={styles.state} role="status">
              <ImageOff aria-hidden="true" />
              <strong>{searchQuery || tagFilter || ratingFilter ? "没有匹配的照片" : "还没有照片"}</strong>
              <span>{searchQuery || tagFilter || ratingFilter ? "请调整搜索或筛选条件。" : "导入照片后会在这里显示。"}</span>
            </div>
          ) : compareMode ? (
            <div className={styles.compareLayout}>
              <div className={styles.compareBrowser}>{photoView}</div>
              <section className={styles.comparePreview} aria-label="照片对比基准">
                <button
                  type="button"
                  className={styles.compareClose}
                  onClick={toggleCompare}
                  aria-label="退出照片对比"
                >
                  <X aria-hidden="true" />
                  退出对比
                </button>
                <ComparePreviewImage id={compareLockedId} />
                <strong>对比锁定基准图</strong>
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
