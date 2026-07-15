import { useCallback, useEffect, useState } from "react";
import { useSettings } from "../../../settings";

export const IMPORT_VIEW_STORAGE_KEY = "photomanager-import-view";
export const IMPORT_VIEW_MODES = Object.freeze(["masonry", "list", "gallery"]);
export const DEFAULT_IMPORT_VIEW_MODE = "masonry";

export function normalizeImportViewMode(mode) {
  return IMPORT_VIEW_MODES.includes(mode) ? mode : DEFAULT_IMPORT_VIEW_MODE;
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readImportViewPreference(storage = getBrowserStorage()) {
  let savedMode = null;

  try {
    savedMode = storage?.getItem(IMPORT_VIEW_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_IMPORT_VIEW_MODE;
  }

  const normalizedMode = normalizeImportViewMode(savedMode);

  // Persist the migration immediately so the removed icon view cannot return
  // on a later launch. Unknown historical values receive the same treatment.
  if (savedMode !== null && savedMode !== normalizedMode) {
    try {
      storage?.setItem(IMPORT_VIEW_STORAGE_KEY, normalizedMode);
    } catch {
      // Storage may be blocked; the in-memory preference is still usable.
    }
  }

  return normalizedMode;
}

export function writeImportViewPreference(mode, storage = getBrowserStorage()) {
  const normalizedMode = normalizeImportViewMode(mode);

  try {
    storage?.setItem(IMPORT_VIEW_STORAGE_KEY, normalizedMode);
  } catch {
    // Keep the import browser usable if preference persistence is unavailable.
  }

  return normalizedMode;
}

export function useImportViewPreference(workspace = null, storage = getBrowserStorage()) {
  const { getWorkspaceSettings, updateWorkspace } = useSettings();
  const workspaceMode = workspace ? getWorkspaceSettings(workspace).importView : null;
  const [viewMode, setStoredViewMode] = useState(() =>
    workspace ? normalizeImportViewMode(workspaceMode) : readImportViewPreference(storage),
  );

  useEffect(() => {
    if (workspace) setStoredViewMode(normalizeImportViewMode(workspaceMode));
  }, [workspace, workspaceMode]);

  const setViewMode = useCallback(
    (mode) => {
      const normalizedMode = writeImportViewPreference(mode, storage);
      if (workspace) updateWorkspace(workspace, { importView: normalizedMode });
      setStoredViewMode(normalizedMode);
    },
    [storage, updateWorkspace, workspace],
  );

  return [viewMode, setViewMode];
}
