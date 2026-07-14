import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAlbum, getAlbums } from "../../../services/albumService";
import {
  detectCards,
  importPhotos,
  listenToImportProgress,
  scanCard,
} from "../../../services/importService";
import { selectDirectory } from "../../../services/workspaceService";

export const DEFAULT_IMPORT_ALBUM_NAME = "默认相册";

const NOOP = () => {};

function defaultConfirm(message) {
  return Promise.resolve(globalThis.confirm(message));
}

function defaultNotify(message) {
  globalThis.alert(message);
  return Promise.resolve();
}

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function locationErrorMessage(error) {
  const messages = {
    1: "位置权限被拒绝，请在系统设置中允许 PhotoManager 访问位置",
    2: "暂时无法确定当前位置",
    3: "获取当前位置超时",
  };

  return messages[error?.code]
    || error?.message
    || "获取当前位置失败";
}

function uniqueImportablePaths(paths, alreadyImportedPaths) {
  return [...new Set(Array.isArray(paths) ? paths : [])]
    .filter((path) => !alreadyImportedPaths.has(path));
}

/**
 * Owns all asynchronous data and submission state for the import wizard.
 * View/brush presentation state deliberately stays outside this hook.
 */
export default function useImportWizardData({
  onClose = NOOP,
  onImportComplete = NOOP,
  confirmAction = defaultConfirm,
  notify = defaultNotify,
  geolocation,
  autoSelectDetectedSource = true,
} = {}) {
  const [cards, setCards] = useState([]);
  const [detectingCards, setDetectingCards] = useState(true);
  const [cardDetectionError, setCardDetectionError] = useState(null);

  const [sourcePath, setSourcePathState] = useState("");
  const [photos, setPhotos] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [selectedPathsState, setSelectedPathsState] = useState([]);
  const [photoAlbumsState, setPhotoAlbumsState] = useState({});

  const [albums, setAlbums] = useState([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [albumsError, setAlbumsError] = useState(null);

  const [backupPath, setBackupPath] = useState("");
  const [attachCurrentLocationState, setAttachCurrentLocationState] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");

  const [importing, setImporting] = useState(false);
  const [preparingImport, setPreparingImport] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importError, setImportError] = useState(null);
  const [progressListenerError, setProgressListenerError] = useState(null);

  const mountedRef = useRef(true);
  const sourcePathRef = useRef("");
  const scanRequestRef = useRef(0);
  const albumsRequestRef = useRef(0);
  const locationRequestRef = useRef(0);
  const alreadyImportedPathsRef = useRef(new Set());
  const submissionLockRef = useRef(false);
  const submissionRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanRequestRef.current += 1;
      albumsRequestRef.current += 1;
      locationRequestRef.current += 1;
      submissionRequestRef.current += 1;
    };
  }, []);

  const alreadyImportedPaths = useMemo(
    () => new Set(
      photos
        .filter((photo) => photo.alreadyImported)
        .map((photo) => photo.absolutePath),
    ),
    [photos],
  );

  alreadyImportedPathsRef.current = alreadyImportedPaths;

  const setSelectedPaths = useCallback((nextValue) => {
    setSelectedPathsState((current) => {
      const nextPaths = typeof nextValue === "function"
        ? nextValue(current)
        : nextValue;
      return uniqueImportablePaths(nextPaths, alreadyImportedPathsRef.current);
    });
  }, []);

  const setPhotoAlbums = useCallback((nextValue) => {
    setPhotoAlbumsState((current) => {
      const nextAlbums = typeof nextValue === "function"
        ? nextValue(current)
        : nextValue;

      return Object.fromEntries(
        Object.entries(nextAlbums || {})
          .filter(([path]) => !alreadyImportedPathsRef.current.has(path)),
      );
    });
  }, []);

  const selectedImportPaths = useMemo(
    () => uniqueImportablePaths(selectedPathsState, alreadyImportedPaths),
    [alreadyImportedPaths, selectedPathsState],
  );

  const importedCount = alreadyImportedPaths.size;

  const reloadAlbums = useCallback(async () => {
    const requestId = ++albumsRequestRef.current;
    setAlbumsLoading(true);
    setAlbumsError(null);

    try {
      const list = await getAlbums();
      if (!mountedRef.current || requestId !== albumsRequestRef.current) {
        return null;
      }
      setAlbums(Array.isArray(list) ? list : []);
      return list;
    } catch (error) {
      if (mountedRef.current && requestId === albumsRequestRef.current) {
        setAlbumsError(error);
      }
      return null;
    } finally {
      if (mountedRef.current && requestId === albumsRequestRef.current) {
        setAlbumsLoading(false);
      }
    }
  }, []);

  const selectSource = useCallback(async (path) => {
    const nextPath = typeof path === "string" ? path : "";
    const requestId = ++scanRequestRef.current;
    sourcePathRef.current = nextPath;
    setSourcePathState(nextPath);
    setPhotos([]);
    alreadyImportedPathsRef.current = new Set();
    setSelectedPathsState([]);
    setPhotoAlbumsState({});
    setScanError(null);

    if (!nextPath) {
      setScanning(false);
      return [];
    }

    setScanning(true);
    try {
      const list = await scanCard({ path: nextPath });
      if (!mountedRef.current || requestId !== scanRequestRef.current) {
        return null;
      }

      const nextPhotos = Array.isArray(list) ? list : [];
      const importedPaths = new Set(
        nextPhotos
          .filter((photo) => photo.alreadyImported)
          .map((photo) => photo.absolutePath),
      );
      const freshPaths = nextPhotos
        .filter((photo) => !photo.alreadyImported)
        .map((photo) => photo.absolutePath);

      alreadyImportedPathsRef.current = importedPaths;
      setPhotos(nextPhotos);
      setSelectedPathsState(uniqueImportablePaths(freshPaths, importedPaths));
      setPhotoAlbumsState({});
      return nextPhotos;
    } catch (error) {
      if (mountedRef.current && requestId === scanRequestRef.current) {
        setScanError(error);
      }
      return null;
    } finally {
      if (mountedRef.current && requestId === scanRequestRef.current) {
        setScanning(false);
      }
    }
  }, []);

  const browseSource = useCallback(async () => {
    try {
      const path = await selectDirectory();
      if (!path) return null;
      await selectSource(path);
      return path;
    } catch (error) {
      if (mountedRef.current) setScanError(error);
      return null;
    }
  }, [selectSource]);

  const browseBackup = useCallback(async () => {
    try {
      const path = await selectDirectory();
      if (!path) return null;
      if (mountedRef.current) setBackupPath(path);
      return path;
    } catch (error) {
      return null;
    }
  }, []);

  const createAlbumAndReload = useCallback(async (album) => {
    const result = await createAlbum(album);
    await reloadAlbums();
    return result;
  }, [reloadAlbums]);

  useEffect(() => {
    let cancelled = false;

    const initializeCards = async () => {
      setDetectingCards(true);
      setCardDetectionError(null);
      try {
        const list = await detectCards();
        if (cancelled || !mountedRef.current) return;

        const nextCards = Array.isArray(list) ? list : [];
        setCards(nextCards);
        if (
          autoSelectDetectedSource
          && !sourcePathRef.current
          && nextCards[0]?.path
        ) {
          await selectSource(nextCards[0].path);
        }
      } catch (error) {
        if (!cancelled && mountedRef.current) setCardDetectionError(error);
      } finally {
        if (!cancelled && mountedRef.current) setDetectingCards(false);
      }
    };

    void initializeCards();
    void reloadAlbums();

    return () => {
      cancelled = true;
    };
  }, [autoSelectDetectedSource, reloadAlbums, selectSource]);

  useEffect(() => {
    let disposed = false;
    let removeListener = null;

    const installListener = async () => {
      try {
        const unlisten = await listenToImportProgress((event) => {
          if (!mountedRef.current) return;
          setImportProgress(event.payload);
        });

        if (typeof unlisten !== "function") return;
        if (disposed) {
          unlisten();
        } else {
          removeListener = unlisten;
        }
      } catch (error) {
        if (!disposed && mountedRef.current) setProgressListenerError(error);
      }
    };

    void installListener();

    return () => {
      disposed = true;
      if (removeListener) {
        removeListener();
        removeListener = null;
      }
    };
  }, []);

  const setAttachCurrentLocation = useCallback((nextValue) => {
    setAttachCurrentLocationState((current) => {
      const next = typeof nextValue === "function"
        ? Boolean(nextValue(current))
        : Boolean(nextValue);

      if (!next) {
        locationRequestRef.current += 1;
        setCurrentLocation(null);
        setLocationStatus("idle");
        setLocationError("");
      }
      return next;
    });
  }, []);

  const requestCurrentLocation = useCallback(() => {
    const locationService = geolocation ?? globalThis.navigator?.geolocation;
    const requestId = ++locationRequestRef.current;

    if (!locationService?.getCurrentPosition) {
      const message = "当前系统不支持位置服务";
      if (mountedRef.current) {
        setCurrentLocation(null);
        setLocationStatus("error");
        setLocationError(message);
      }
      return Promise.reject(new Error(message));
    }

    setLocationStatus("locating");
    setLocationError("");

    return new Promise((resolve, reject) => {
      locationService.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          if (mountedRef.current && requestId === locationRequestRef.current) {
            setCurrentLocation(location);
            setLocationStatus("ready");
          }
          resolve(location);
        },
        (error) => {
          const message = locationErrorMessage(error);
          if (mountedRef.current && requestId === locationRequestRef.current) {
            setCurrentLocation(null);
            setLocationStatus("error");
            setLocationError(message);
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        },
      );
    });
  }, [geolocation]);

  const startImport = useCallback(async () => {
    if (submissionLockRef.current) return { status: "busy" };
    submissionLockRef.current = true;
    const submissionId = ++submissionRequestRef.current;
    if (mountedRef.current) setPreparingImport(true);

    const submissionCancelled = () => (
      !mountedRef.current || submissionId !== submissionRequestRef.current
    );

    let importStarted = false;
    try {
      // Re-filter here as a final safety boundary in case a caller retained a
      // stale selection while a rescan marked the same path as imported.
      const safePaths = uniqueImportablePaths(
        selectedImportPaths,
        alreadyImportedPathsRef.current,
      );

      if (safePaths.length === 0) {
        await notify("请至少选择一张照片进行导入！");
        return { status: "empty" };
      }

      let importLocation = null;
      if (attachCurrentLocationState) {
        try {
          importLocation = await requestCurrentLocation();
          if (submissionCancelled()) return { status: "cancelled" };
        } catch (error) {
          if (submissionCancelled()) return { status: "cancelled" };
          const continueWithoutLocation = await confirmAction(
            `${error.message}\n\n是否继续导入，但不为缺少 GPS 的照片添加位置？`,
          );
          if (!continueWithoutLocation) return { status: "cancelled-location" };
        }
      }

      if (submissionCancelled()) return { status: "cancelled" };

      const confirmed = await confirmAction(
        "【导入提示】\n在导入期间，请保持电脑开机、挂载设备连接稳定。确定开始导入吗？",
      );
      if (!confirmed) return { status: "cancelled" };
      if (submissionCancelled()) return { status: "cancelled" };

      importStarted = true;
      setPreparingImport(false);
      setImporting(true);
      setImportError(null);
      setImportProgress({
        copied: 0,
        total: safePaths.length,
        currentFile: "准备导入中…",
      });

      const imports = safePaths.map((path) => ({
        absolute_path: path,
        album_name: photoAlbumsState[path] || DEFAULT_IMPORT_ALBUM_NAME,
      }));
      const count = await importPhotos({
        imports,
        backupPath: backupPath.trim() || null,
        currentLocation: attachCurrentLocationState ? importLocation : null,
      });

      if (submissionCancelled()) return { status: "complete", count };

      await notify(`导入成功！共复制并注册了 ${count} 张照片。`);
      if (submissionCancelled()) return { status: "complete", count };
      onImportComplete(count);
      onClose();
      return { status: "complete", count };
    } catch (error) {
      if (submissionCancelled()) return { status: "cancelled" };
      if (mountedRef.current) setImportError(error);
      await notify(`导入失败: ${toErrorMessage(error, "未知错误")}`);
      return { status: "error", error };
    } finally {
      submissionLockRef.current = false;
      if (mountedRef.current && submissionId === submissionRequestRef.current) {
        setPreparingImport(false);
        if (importStarted) {
          setImporting(false);
          setImportProgress(null);
        }
      }
    }
  }, [
    attachCurrentLocationState,
    backupPath,
    confirmAction,
    notify,
    onClose,
    onImportComplete,
    photoAlbumsState,
    requestCurrentLocation,
    selectedImportPaths,
  ]);

  return {
    cards,
    detectingCards,
    cardDetectionError,
    sourcePath,
    photos,
    scanning,
    scanError,
    selectedPaths: selectedPathsState,
    setSelectedPaths,
    photoAlbums: photoAlbumsState,
    setPhotoAlbums,
    alreadyImportedPaths,
    selectedImportPaths,
    importedCount,
    albums,
    albumsLoading,
    albumsError,
    reloadAlbums,
    createAlbumAndReload,
    selectSource,
    browseSource,
    backupPath,
    setBackupPath,
    browseBackup,
    attachCurrentLocation: attachCurrentLocationState,
    setAttachCurrentLocation,
    currentLocation,
    locationStatus,
    locationError,
    requestCurrentLocation,
    importing,
    preparingImport,
    importProgress,
    importError,
    progressListenerError,
    startImport,
  };
}
