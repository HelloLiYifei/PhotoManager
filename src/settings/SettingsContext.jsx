/* eslint-disable react-refresh/only-export-components -- provider, hooks, and migration helpers share one store contract */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const SETTINGS_STORAGE_KEY = "photomanager-settings-v1";
export const LEGACY_PHOTO_VIEW_KEY = "photomanager-photo-view";
export const LEGACY_IMPORT_VIEW_KEY = "photomanager-import-view";

export const VIEW_MODES = Object.freeze(["masonry", "list", "gallery"]);
export const THEMES = Object.freeze(["system", "dark", "light"]);
export const LOCALES = Object.freeze(["zh-CN", "en-US"]);
export const DENSITIES = Object.freeze(["comfortable", "compact"]);
export const MOTION_MODES = Object.freeze(["system", "full", "reduced"]);

export const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
  locale: "zh-CN",
  theme: "dark",
  density: "comfortable",
  motion: "system",
});

export const DEFAULT_WORKSPACE_SETTINGS = Object.freeze({
  photoView: "masonry",
  importView: "masonry",
  autoSelectDetectedSource: true,
  attachCurrentLocation: true,
  backupPath: "",
});

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  global: DEFAULT_GLOBAL_SETTINGS,
  workspaceDefaults: DEFAULT_WORKSPACE_SETTINGS,
  workspaces: {},
});

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeGlobal(value = {}) {
  return {
    locale: pickEnum(value.locale, LOCALES, DEFAULT_GLOBAL_SETTINGS.locale),
    theme: pickEnum(value.theme, THEMES, DEFAULT_GLOBAL_SETTINGS.theme),
    density: pickEnum(value.density, DENSITIES, DEFAULT_GLOBAL_SETTINGS.density),
    motion: pickEnum(value.motion, MOTION_MODES, DEFAULT_GLOBAL_SETTINGS.motion),
  };
}

function normalizeWorkspace(value = {}, fallback = DEFAULT_WORKSPACE_SETTINGS) {
  return {
    photoView: pickEnum(value.photoView, VIEW_MODES, fallback.photoView),
    importView: pickEnum(value.importView, VIEW_MODES, fallback.importView),
    autoSelectDetectedSource:
      typeof value.autoSelectDetectedSource === "boolean"
        ? value.autoSelectDetectedSource
        : fallback.autoSelectDetectedSource,
    attachCurrentLocation:
      typeof value.attachCurrentLocation === "boolean"
        ? value.attachCurrentLocation
        : fallback.attachCurrentLocation,
    backupPath: typeof value.backupPath === "string" ? value.backupPath : fallback.backupPath,
  };
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readLegacyView(storage, key) {
  try {
    const value = storage?.getItem(key);
    return VIEW_MODES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function normalizeSettings(value = {}, storage = null) {
  const legacyPhotoView = readLegacyView(storage, LEGACY_PHOTO_VIEW_KEY);
  const legacyImportView = readLegacyView(storage, LEGACY_IMPORT_VIEW_KEY);
  const workspaceDefaults = normalizeWorkspace({
    ...value.workspaceDefaults,
    photoView: value.workspaceDefaults?.photoView ?? legacyPhotoView ?? undefined,
    importView: value.workspaceDefaults?.importView ?? legacyImportView ?? undefined,
  });

  const workspaces = Object.fromEntries(
    Object.entries(value.workspaces && typeof value.workspaces === "object" ? value.workspaces : {})
      .map(([key, workspaceValue]) => [
        key,
        normalizeWorkspace(workspaceValue, workspaceDefaults),
      ]),
  );

  return {
    version: 1,
    global: normalizeGlobal(value.global),
    workspaceDefaults,
    workspaces,
  };
}

export function readSettings(storage = getStorage()) {
  let parsed = {};

  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return normalizeSettings(parsed, storage);
}

export function workspaceSettingsKey(workspace) {
  if (workspace?.id) return `id:${workspace.id}`;
  if (!workspace?.path) return "default";
  return `path:${workspace.path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase()}`;
}

const SettingsContext = createContext(null);
const FALLBACK_SETTINGS_CONTEXT = {
  settings: DEFAULT_SETTINGS,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  persistenceError: "",
  updateGlobal: () => {},
  getWorkspaceSettings: () => DEFAULT_WORKSPACE_SETTINGS,
  updateWorkspace: () => {},
  resetAll: () => {},
};

export function SettingsProvider({ children, storage = getStorage() }) {
  const [settings, setSettings] = useState(() => readSettings(storage));
  const [persistenceError, setPersistenceError] = useState("");

  const persist = useCallback((nextSettings) => {
    try {
      storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
      storage?.removeItem(LEGACY_PHOTO_VIEW_KEY);
      storage?.removeItem(LEGACY_IMPORT_VIEW_KEY);
      setPersistenceError("");
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : String(error));
    }
  }, [storage]);

  const replaceSettings = useCallback((updater) => {
    setSettings((current) => {
      const next = normalizeSettings(
        typeof updater === "function" ? updater(current) : updater,
      );
      persist(next);
      return next;
    });
  }, [persist]);

  const updateGlobal = useCallback((patch) => {
    replaceSettings((current) => ({
      ...current,
      global: { ...current.global, ...patch },
    }));
  }, [replaceSettings]);

  const getWorkspaceSettings = useCallback((workspace) => {
    const key = workspaceSettingsKey(workspace);
    return settings.workspaces[key] ?? settings.workspaceDefaults;
  }, [settings]);

  const updateWorkspace = useCallback((workspace, patch) => {
    const key = workspaceSettingsKey(workspace);
    replaceSettings((current) => ({
      ...current,
      workspaces: {
        ...current.workspaces,
        [key]: {
          ...(current.workspaces[key] ?? current.workspaceDefaults),
          ...patch,
        },
      },
    }));
  }, [replaceSettings]);

  const resetAll = useCallback(() => {
    replaceSettings(DEFAULT_SETTINGS);
  }, [replaceSettings]);

  useEffect(() => {
    const root = document.documentElement;
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const effectiveTheme = settings.global.theme === "system"
        ? (media?.matches ? "dark" : "light")
        : settings.global.theme;
      root.dataset.theme = effectiveTheme;
      root.dataset.themePreference = settings.global.theme;
      root.style.colorScheme = effectiveTheme;
    };

    applyTheme();
    media?.addEventListener?.("change", applyTheme);
    return () => media?.removeEventListener?.("change", applyTheme);
  }, [settings.global.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = settings.global.density;
    root.dataset.motion = settings.global.motion;
    root.lang = settings.global.locale;
  }, [settings.global.density, settings.global.locale, settings.global.motion]);

  const value = useMemo(() => ({
    settings,
    globalSettings: settings.global,
    persistenceError,
    updateGlobal,
    getWorkspaceSettings,
    updateWorkspace,
    resetAll,
  }), [
    getWorkspaceSettings,
    persistenceError,
    resetAll,
    settings,
    updateGlobal,
    updateWorkspace,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  return value ?? FALLBACK_SETTINGS_CONTEXT;
}
