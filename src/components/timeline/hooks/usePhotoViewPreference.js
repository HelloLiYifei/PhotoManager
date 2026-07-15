import { useCallback, useState } from "react";
import { useEffect } from "react";
import { useSettings } from "../../../settings";

export const PHOTO_VIEW_STORAGE_KEY = "photomanager-photo-view";
export const PHOTO_VIEW_MODES = Object.freeze(["masonry", "list", "gallery"]);
export const DEFAULT_PHOTO_VIEW_MODE = "masonry";

export function normalizePhotoViewMode(mode) {
  return PHOTO_VIEW_MODES.includes(mode) ? mode : DEFAULT_PHOTO_VIEW_MODE;
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readPhotoViewPreference(storage = getBrowserStorage()) {
  let savedMode = null;

  try {
    savedMode = storage?.getItem(PHOTO_VIEW_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_PHOTO_VIEW_MODE;
  }

  const normalizedMode = normalizePhotoViewMode(savedMode);

  // Rewrite legacy `icons` (and any unknown stored value) as soon as it is read.
  if (savedMode !== null && savedMode !== normalizedMode) {
    try {
      storage?.setItem(PHOTO_VIEW_STORAGE_KEY, normalizedMode);
    } catch {
      // A blocked storage write must not prevent the photo browser from opening.
    }
  }

  return normalizedMode;
}

export function writePhotoViewPreference(mode, storage = getBrowserStorage()) {
  const normalizedMode = normalizePhotoViewMode(mode);

  try {
    storage?.setItem(PHOTO_VIEW_STORAGE_KEY, normalizedMode);
  } catch {
    // Keep the in-memory preference usable when storage is unavailable.
  }

  return normalizedMode;
}

export function usePhotoViewPreference(workspace = null, storage = getBrowserStorage()) {
  const { getWorkspaceSettings, updateWorkspace } = useSettings();
  const workspaceMode = workspace ? getWorkspaceSettings(workspace).photoView : null;
  const [viewMode, setStoredViewMode] = useState(() =>
    workspace ? normalizePhotoViewMode(workspaceMode) : readPhotoViewPreference(storage),
  );

  useEffect(() => {
    if (workspace) setStoredViewMode(normalizePhotoViewMode(workspaceMode));
  }, [workspace, workspaceMode]);

  const setViewMode = useCallback(
    (mode) => {
      const normalizedMode = writePhotoViewPreference(mode, storage);
      if (workspace) updateWorkspace(workspace, { photoView: normalizedMode });
      setStoredViewMode(normalizedMode);
    },
    [storage, updateWorkspace, workspace],
  );

  return [viewMode, setViewMode];
}
