import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalDialogProvider } from "./components/ui";
import { I18nProvider } from "./i18n";
import { SettingsProvider } from "./settings";
import "./styles/tokens.css";

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
