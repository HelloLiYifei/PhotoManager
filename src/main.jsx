import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalDialogProvider } from "./components/ui";
import { I18nProvider } from "./i18n";
import {
  activateAppScale,
  applyTextScaleVariables,
  readSettings,
  SettingsProvider,
} from "./settings";
import {
  DEFAULT_THEME_ID,
  activateTheme,
  resolveEffectiveTheme,
} from "./themes";

const initialSettings = readSettings();
applyTextScaleVariables(initialSettings.global.textScale);
const initialPreference = initialSettings.global.theme;
const prefersDark = Boolean(
  globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches,
);

try {
  await activateTheme(resolveEffectiveTheme(initialPreference, prefersDark));
  document.documentElement.dataset.themePreference = initialPreference;
} catch (error) {
  console.error("Failed to load the saved theme", error);
  await activateTheme(DEFAULT_THEME_ID);
  document.documentElement.dataset.themePreference = DEFAULT_THEME_ID;
}

try {
  await activateAppScale(initialSettings.global.appScale);
} catch (error) {
  console.error("Failed to apply the saved application scale", error);
  await activateAppScale(100).catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <GlobalDialogProvider>
          <App />
        </GlobalDialogProvider>
      </I18nProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
