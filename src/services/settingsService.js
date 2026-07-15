import { invokeCommand, listenToEvent } from "./tauriClient";

export const getWorkspaceStorageStats = () =>
  invokeCommand("get_workspace_storage_stats");

export const clearWorkspaceCache = (args) =>
  invokeCommand("clear_workspace_cache", args);

export const setWorkspaceCacheLimits = (args) =>
  invokeCommand("set_workspace_cache_limits", args);

export const scanWorkspace = () => invokeCommand("scan_workspace");

export const listenToScanProgress = (handler) =>
  listenToEvent("scan-progress", handler);

