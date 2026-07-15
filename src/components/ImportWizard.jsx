import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, FolderOpen, LoaderCircle, X } from "lucide-react";

import { useI18n } from "../i18n";
import CreateAlbumDialog from "./CreateAlbumDialog";
import LightboxViewer from "./LightboxViewer";
import {
  AlbumBrushPanel,
  ConfigurationPanel,
  ImportConfirmBar,
  ImportOptions,
  ImportPreviewToolbar,
  ImportProgressOverlay,
  SourceConfig,
} from "./import/controls";
import {
  DEFAULT_IMPORT_ALBUM_NAME,
  useAlbumBrush,
  useImportViewPreference,
  useImportWizardData,
} from "./import/hooks";
import {
  getImportAlbumColor,
  ImportGalleryView,
  ImportListView,
  ImportMasonryView,
} from "./import/views";
import { useGlobalDialog } from "./ui";
import styles from "./ImportWizard.module.css";

const INITIAL_VISIBLE_PHOTOS = 64;

function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export default function ImportWizard({ onClose, onImportComplete, workspace, preferences = {} }) {
  const { formatNumber, t } = useI18n();
  const { alert: showAlert, confirm: showConfirm } = useGlobalDialog();
  const notify = useCallback((message) => {
    const failed = message.includes("失败") || /fail|error/i.test(message);
    return showAlert(message, {
      title: failed ? t("import.failed") : t("import.notice"),
      tone: failed ? "danger" : "success",
    });
  }, [showAlert, t]);
  const data = useImportWizardData({
    onClose,
    onImportComplete,
    confirmAction: showConfirm,
    notify,
    autoSelectDetectedSource: preferences.autoSelectDetectedSource ?? true,
    initialBackupPath: preferences.backupPath ?? "",
    initialAttachCurrentLocation: preferences.attachCurrentLocation ?? true,
  });
  const [viewMode, setViewMode] = useImportViewPreference(workspace);
  const [sourceDraft, setSourceDraft] = useState("");
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [hideImported, setHideImported] = useState(false);
  const [hideColored, setHideColored] = useState(false);
  const [focusedPath, setFocusedPath] = useState(null);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_PHOTOS);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDescription, setNewAlbumDescription] = useState("");
  const [createAlbumBusy, setCreateAlbumBusy] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const previewScrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const paintingRef = useRef(false);
  const paintedPathsRef = useRef(new Set());
  const sourceDraftDirtyRef = useRef(false);
  const importBusy = data.preparingImport || data.importing;
  const selectImportSource = data.selectSource;
  const browseImportSource = data.browseSource;

  const brush = useAlbumBrush({
    photos: data.photos,
    selectedPaths: data.selectedPaths,
    setSelectedPaths: data.setSelectedPaths,
    photoAlbums: data.photoAlbums,
    setPhotoAlbums: data.setPhotoAlbums,
    alreadyImportedPaths: data.alreadyImportedPaths,
  });

  const selectedPathSet = useMemo(
    () => new Set(data.selectedPaths),
    [data.selectedPaths],
  );
  const filteredPhotos = useMemo(
    () => data.photos.filter((photo) => {
      if (hideImported && photo.alreadyImported) return false;
      if (hideColored && selectedPathSet.has(photo.absolutePath)) return false;
      return true;
    }),
    [data.photos, hideColored, hideImported, selectedPathSet],
  );
  const visiblePhotos = filteredPhotos.slice(0, visibleLimit);

  const albumBrushOptions = useMemo(() => [
    { id: "__default_album__", name: DEFAULT_IMPORT_ALBUM_NAME },
    ...data.albums.filter((album) => album.name !== DEFAULT_IMPORT_ALBUM_NAME),
  ], [data.albums]);

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_PHOTOS);
  }, [data.sourcePath, hideColored, hideImported]);

  useEffect(() => {
    if (!sourceDraftDirtyRef.current) setSourceDraft(data.sourcePath);
  }, [data.sourcePath]);

  useEffect(() => {
    const nextFocusedPhoto = filteredPhotos.find(
      (photo) => photo.absolutePath === focusedPath,
    );
    if (!nextFocusedPhoto) {
      setFocusedPath(filteredPhotos[0]?.absolutePath || null);
    }
  }, [filteredPhotos, focusedPath]);

  useEffect(() => {
    if (viewMode === "gallery") return undefined;
    const container = previewScrollRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel || visibleLimit >= filteredPhotos.length) {
      return undefined;
    }

    if (typeof IntersectionObserver === "undefined") {
      setVisibleLimit(filteredPhotos.length);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleLimit((current) => Math.min(filteredPhotos.length, current + 64));
        }
      },
      { root: container, rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredPhotos.length, viewMode, visibleLimit]);

  useEffect(() => {
    const stopPainting = () => {
      paintingRef.current = false;
      paintedPathsRef.current.clear();
    };
    window.addEventListener("mouseup", stopPainting);
    return () => window.removeEventListener("mouseup", stopPainting);
  }, []);

  const activatePhoto = useCallback((photo) => {
    setFocusedPath(photo.absolutePath);
  }, []);

  const paintPhoto = useCallback((photo, event) => {
    if (event?.type === "keydown") {
      brush.applyBrushColor(photo.absolutePath);
      return;
    }

    paintingRef.current = true;
    if (paintedPathsRef.current.has(photo.absolutePath)) return;
    paintedPathsRef.current.add(photo.absolutePath);
    brush.applyBrushColor(photo.absolutePath);
  }, [brush]);

  const paintEnteredPhoto = useCallback((photo) => {
    if (!paintingRef.current || paintedPathsRef.current.has(photo.absolutePath)) return;
    paintedPathsRef.current.add(photo.absolutePath);
    brush.applyBrushColor(photo.absolutePath);
  }, [brush]);

  const getPhotoVisualState = useCallback(
    (photo) => brush.getPhotoVisualState(photo, focusedPath),
    [brush, focusedPath],
  );

  const handleBrushChange = useCallback((albumName) => {
    brush.setBrushAlbum(albumName);
    setConfigurationOpen(false);
  }, [brush]);

  const handleSourceDraftChange = useCallback((nextPath) => {
    sourceDraftDirtyRef.current = true;
    setSourceDraft(nextPath);
  }, []);

  const handleSelectSource = useCallback((path) => {
    sourceDraftDirtyRef.current = false;
    setSourceDraft(path);
    return selectImportSource(path);
  }, [selectImportSource]);

  const handleBrowseSource = useCallback(async () => {
    const wasDirty = sourceDraftDirtyRef.current;
    const previousDraft = sourceDraft;
    const path = await browseImportSource();
    if (path) {
      sourceDraftDirtyRef.current = false;
      setSourceDraft(path);
    } else {
      sourceDraftDirtyRef.current = wasDirty;
      if (wasDirty) setSourceDraft(previousDraft);
    }
    return path;
  }, [browseImportSource, sourceDraft]);

  const handleCreateAlbum = useCallback(async () => {
    if (!newAlbumName.trim() || createAlbumBusy) return;
    setCreateAlbumBusy(true);
    setCreateAlbumError(null);
    try {
      await data.createAlbumAndReload({
        name: newAlbumName.trim(),
        description: newAlbumDescription.trim() || null,
      });
      setNewAlbumName("");
      setNewAlbumDescription("");
      setCreateAlbumOpen(false);
    } catch (error) {
      setCreateAlbumError(error);
    } finally {
      setCreateAlbumBusy(false);
    }
  }, [createAlbumBusy, data, newAlbumDescription, newAlbumName]);

  const handleOpenPhotoDetail = useCallback((photo) => {
    if (brush.brushAlbum) return;
    const initialIndex = filteredPhotos.findIndex(
      (candidate) => candidate.absolutePath === photo.absolutePath,
    );
    if (initialIndex < 0) return;
    setDetailData({
      photosList: [...filteredPhotos],
      initialIndex,
    });
  }, [brush.brushAlbum, filteredPhotos]);

  const detailAlbums = useMemo(
    () => albumBrushOptions.map((album) => ({
      ...album,
      color: getImportAlbumColor(album.name),
    })),
    [albumBrushOptions],
  );

  const previewProps = {
    scrollRoot: previewScrollRef,
    brushAlbum: brush.brushAlbum,
    getPhotoVisualState,
    onActivatePhoto: activatePhoto,
    onBrushPhoto: paintPhoto,
    onBrushEnter: paintEnteredPhoto,
    onOpenPhoto: handleOpenPhotoDetail,
  };

  let preview = null;
  if (viewMode === "list") {
    preview = <ImportListView photos={visiblePhotos} {...previewProps} />;
  } else if (viewMode === "gallery") {
    preview = (
      <ImportGalleryView
        photos={filteredPhotos}
        activePath={focusedPath}
        {...previewProps}
      />
    );
  } else {
    preview = <ImportMasonryView photos={visiblePhotos} {...previewProps} />;
  }

  const progress = data.importProgress || {
    copied: 0,
    total: data.selectedImportPaths.length,
    currentFile: t("import.preparing"),
  };

  return (
    <>
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("import.wizardLabel")}>
      <section className={styles.wizard} aria-busy={importBusy}>
        <header className={styles.header}>
          <span className={styles.headerIcon}><Camera aria-hidden="true" /></span>
          <div>
            <h1>{t("import.title")}</h1>
            <p>{t("import.description")}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={importBusy}
            aria-label={t("import.closeWizard")}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <ConfigurationPanel
            open={configurationOpen}
            disabled={importBusy}
            onOpen={() => setConfigurationOpen(true)}
            onClose={() => setConfigurationOpen(false)}
          >
            <SourceConfig
              sourcePath={sourceDraft}
              cards={data.cards}
              scanning={data.scanning}
              detectingCards={data.detectingCards}
              scannedCount={data.sourcePath ? data.photos.length : null}
              scanError={data.scanError ? getErrorMessage(data.scanError, t("common.unknownError")) : ""}
              disabled={importBusy}
              onSourcePathChange={handleSourceDraftChange}
              onScanSource={handleSelectSource}
              onBrowse={handleBrowseSource}
              onSelectCard={(path) => handleSelectSource(path)}
            />

            {data.cardDetectionError ? (
              <p className={styles.configError} role="alert">
                {getErrorMessage(data.cardDetectionError, t("import.detectStorageFailed"))}
              </p>
            ) : null}

            <AlbumBrushPanel
              albums={albumBrushOptions}
              activeAlbum={brush.brushAlbum}
              disabled={importBusy || data.scanning}
              getAlbumColor={getImportAlbumColor}
              onBrushChange={handleBrushChange}
              onCreateAlbum={() => setCreateAlbumOpen(true)}
            />

            {data.albumsError ? (
              <p className={styles.configError} role="alert">
                {getErrorMessage(data.albumsError, t("import.readAlbumsFailed"))}
              </p>
            ) : null}

            <ImportOptions
              attachCurrentLocation={data.attachCurrentLocation}
              locationStatus={data.locationStatus}
              currentLocation={data.currentLocation}
              locationError={data.locationError}
              backupPath={data.backupPath}
              disabled={importBusy}
              onAttachCurrentLocationChange={data.setAttachCurrentLocation}
              onRequestLocation={() => data.requestCurrentLocation().catch(() => {})}
              onBackupPathChange={data.setBackupPath}
              onBrowseBackup={data.browseBackup}
            />
          </ConfigurationPanel>

          <main className={`${styles.previewPanel} ${brush.brushAlbum ? styles.brushActive : ""}`}>
            <div
              ref={previewScrollRef}
              className={styles.previewScroller}
              data-view-mode={viewMode}
              onMouseUp={() => { paintingRef.current = false; }}
              onMouseLeave={() => { paintingRef.current = false; }}
            >
              <ImportPreviewToolbar
                visibleCount={filteredPhotos.length}
                totalCount={data.photos.length}
                selectedCount={data.selectedImportPaths.length}
                importedCount={data.importedCount}
                viewMode={viewMode}
                hideImported={hideImported}
                hideColored={hideColored}
                disabled={importBusy || data.scanning}
                onViewModeChange={setViewMode}
                onHideImportedChange={(value) => setHideImported(value)}
                onHideColoredChange={(value) => setHideColored(value)}
              />

              {data.importedCount > 0 ? (
                <div className={styles.duplicateNotice} role="status">
                  {t("import.duplicatesDetected", { count: formatNumber(data.importedCount) })}
                </div>
              ) : null}

              {data.progressListenerError ? (
                <div className={styles.inlineError} role="alert">
                  <AlertCircle aria-hidden="true" />
                  {t("import.progressListenerFailed", { message: getErrorMessage(data.progressListenerError, t("common.unknownError")) })}
                </div>
              ) : null}

              {data.importError ? (
                <div className={styles.inlineError} role="alert">
                  <AlertCircle aria-hidden="true" />
                  {getErrorMessage(data.importError, t("import.failedRetry"))}
                </div>
              ) : null}

              <div className={styles.previewContent} data-view-mode={viewMode}>
                {data.scanning ? (
                  <div className={styles.emptyState} role="status">
                    <LoaderCircle className={styles.spinner} aria-hidden="true" />
                    <strong>{t("import.scanningPhotos")}</strong>
                    <span>{t("import.readingPhotoTree")}</span>
                  </div>
                ) : data.scanError ? (
                  <div className={styles.emptyState} role="alert">
                    <AlertCircle aria-hidden="true" />
                    <strong>{t("import.scanFailed")}</strong>
                    <span>{getErrorMessage(data.scanError, t("common.unknownError"))}</span>
                  </div>
                ) : data.photos.length === 0 ? (
                  <div className={styles.emptyState} role="status">
                    <FolderOpen aria-hidden="true" />
                    <strong>{t("import.chooseSource")}</strong>
                    <span>{t("import.chooseSourceDescription")}</span>
                  </div>
                ) : filteredPhotos.length === 0 ? (
                  <div className={styles.emptyState} role="status">
                    <FolderOpen aria-hidden="true" />
                    <strong>{t("import.noFilteredPhotos")}</strong>
                    <span>{t("import.noFilteredPhotosDescription")}</span>
                  </div>
                ) : preview}
              </div>

              {viewMode !== "gallery" && visibleLimit < filteredPhotos.length ? (
                <div ref={sentinelRef} className={styles.sentinel} role="status">
                  {t("import.preparingMorePreviews")}
                </div>
              ) : null}
            </div>
          </main>
        </div>

        <ImportConfirmBar
          selectedCount={data.selectedImportPaths.length}
          totalCount={data.photos.length}
          importedCount={data.importedCount}
          activeBrush={brush.brushAlbum || t("import.defaultAlbum")}
          brushColor={getImportAlbumColor(brush.brushAlbum || DEFAULT_IMPORT_ALBUM_NAME)}
          importing={data.importing}
          scanning={data.scanning}
          disabled={data.preparingImport}
          onColorAll={brush.colorAll}
          onClearColors={brush.clearColors}
          onImport={data.startImport}
        />

        <CreateAlbumDialog
          open={createAlbumOpen}
          name={newAlbumName}
          description={newAlbumDescription}
          busy={createAlbumBusy}
          error={createAlbumError}
          onNameChange={setNewAlbumName}
          onDescriptionChange={setNewAlbumDescription}
          onSubmit={handleCreateAlbum}
          onClose={() => {
            if (createAlbumBusy) return;
            setCreateAlbumOpen(false);
            setCreateAlbumError(null);
          }}
        />

        <ImportProgressOverlay
          open={importBusy}
          copied={progress.copied}
          total={progress.total}
          currentFile={progress.currentFile}
          title={data.preparingImport ? t("import.preparingImport") : undefined}
        />
      </section>
    </div>
    {detailData && (
      <LightboxViewer
        mode="import"
        photosList={detailData.photosList}
        initialIndex={detailData.initialIndex}
        importAlbums={detailAlbums}
        getImportPhotoState={getPhotoVisualState}
        onSetImportAlbum={(photo, albumName) => {
          brush.setPhotoAlbum(photo.absolutePath, albumName);
        }}
        onClose={() => setDetailData(null)}
      />
    )}
    </>
  );
}
