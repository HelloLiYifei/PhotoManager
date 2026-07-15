import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalDialogProvider } from "./components/ui";
import { I18nProvider } from "./i18n";
import { readSettings, SettingsProvider } from "./settings";
import {
  DEFAULT_THEME_ID,
  activateTheme,
  resolveEffectiveTheme,
} from "./themes";

const initialSettings = readSettings();
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
