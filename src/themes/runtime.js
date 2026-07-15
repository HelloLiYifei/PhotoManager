import { getTheme } from "./registry";

let activationSequence = 0;
let activeStyle = null;
let activeThemeId = null;
const cssCache = new Map();

async function loadThemeCss(theme) {
  if (!cssCache.has(theme.id)) {
    cssCache.set(theme.id, Promise.resolve(theme.loadCss()));
  }
  return cssCache.get(theme.id);
}

export async function activateTheme(themeId, root = document.documentElement) {
  const theme = getTheme(themeId);
  if (!theme) throw new Error(`Unknown theme: ${themeId}`);
  if (activeThemeId === themeId && activeStyle?.isConnected) {
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.colorScheme;
    return theme;
  }

  const sequence = ++activationSequence;
  const css = await loadThemeCss(theme);
  if (sequence !== activationSequence) return null;

  const style = document.createElement("style");
  style.dataset.appTheme = theme.id;
  style.media = "not all";
  style.textContent = css;
  document.head.append(style);

  if (sequence !== activationSequence) {
    style.remove();
    return null;
  }

  const previousStyle = activeStyle;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;
  if (previousStyle) previousStyle.media = "not all";
  style.media = "all";
  previousStyle?.remove();

  activeStyle = style;
  activeThemeId = theme.id;
  return theme;
}

export function resetThemeRuntimeForTests() {
  activationSequence += 1;
  activeStyle?.remove();
  activeStyle = null;
  activeThemeId = null;
  cssCache.clear();
}
