const manifestModules = import.meta.glob("./*/theme.json", {
  eager: true,
  import: "default",
});

const styleLoaders = import.meta.glob("./*/index.css", {
  query: "?inline",
  import: "default",
});

const REQUIRED_LABELS = ["zh-CN", "en-US"];
const COLOR_SCHEMES = new Set(["dark", "light"]);

function directoryFromPath(path) {
  return path.split("/").at(-2);
}

function validateManifest(path, manifest) {
  const directory = directoryFromPath(path);
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Invalid theme manifest: ${path}`);
  }
  if (manifest.id !== directory || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error(`Theme id must match its directory: ${path}`);
  }
  if (!COLOR_SCHEMES.has(manifest.colorScheme)) {
    throw new Error(`Theme ${manifest.id} must use a dark or light colorScheme`);
  }
  if (!Number.isFinite(manifest.order)) {
    throw new Error(`Theme ${manifest.id} must define a numeric order`);
  }
  if (typeof manifest.systemDefault !== "boolean") {
    throw new Error(`Theme ${manifest.id} must define systemDefault`);
  }
  for (const locale of REQUIRED_LABELS) {
    if (!manifest.labels?.[locale]) {
      throw new Error(`Theme ${manifest.id} is missing the ${locale} label`);
    }
  }

  const stylePath = path.replace(/theme\.json$/, "index.css");
  const loadCss = styleLoaders[stylePath];
  if (!loadCss) throw new Error(`Theme ${manifest.id} is missing index.css`);

  return Object.freeze({ ...manifest, loadCss });
}

const registeredThemes = Object.entries(manifestModules)
  .map(([path, manifest]) => validateManifest(path, manifest))
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

const themeById = new Map();
for (const theme of registeredThemes) {
  if (themeById.has(theme.id)) throw new Error(`Duplicate theme id: ${theme.id}`);
  themeById.set(theme.id, theme);
}

const systemDefaults = new Map();
for (const colorScheme of COLOR_SCHEMES) {
  const matches = registeredThemes.filter(
    (theme) => theme.colorScheme === colorScheme && theme.systemDefault,
  );
  if (matches.length !== 1) {
    throw new Error(`Exactly one ${colorScheme} theme must be marked systemDefault`);
  }
  systemDefaults.set(colorScheme, matches[0]);
}

export const THEME_IDS = Object.freeze(registeredThemes.map((theme) => theme.id));
export const THEMES = Object.freeze(["system", ...THEME_IDS]);
export const DEFAULT_THEME_ID = systemDefaults.get("dark").id;

export function listThemes(locale = "en-US") {
  return registeredThemes.map((theme) => ({
    value: theme.id,
    label: theme.labels[locale] ?? theme.labels["en-US"] ?? theme.id,
    colorScheme: theme.colorScheme,
  }));
}

export function getTheme(themeId) {
  return themeById.get(themeId) ?? null;
}

export function normalizeThemePreference(value) {
  return value === "system" || themeById.has(value) ? value : DEFAULT_THEME_ID;
}

export function resolveEffectiveTheme(preference, prefersDark = false) {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== "system") return normalized;
  return systemDefaults.get(prefersDark ? "dark" : "light").id;
}
