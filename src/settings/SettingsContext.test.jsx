import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DISPLAY_SCALE_LIMITS,
  LEGACY_IMPORT_VIEW_KEY,
  LEGACY_PHOTO_VIEW_KEY,
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
  readSettings,
  useSettings,
} from "./SettingsContext";
import { resetDisplayRuntimeForTests } from "./displayRuntime";

function Harness() {
  const {
    globalSettings,
    getWorkspaceSettings,
    resetAll,
    setAppScale,
    setTextScale,
    setTheme,
    updateWorkspace,
  } = useSettings();
  const workspace = { id: "one", path: "D:/Photos" };
  const scoped = getWorkspaceSettings(workspace);
  return (
    <>
      <output>{`${globalSettings.theme}:${scoped.photoView}:${globalSettings.appScale}:${globalSettings.textScale.navigation}`}</output>
      <button type="button" onClick={() => void setTheme("light")}>light</button>
      <button type="button" onClick={() => updateWorkspace(workspace, { photoView: "list" })}>list</button>
      <button type="button" onClick={() => void setAppScale(150)}>scale</button>
      <button type="button" onClick={() => setTextScale("navigation", 125)}>text</button>
      <button type="button" onClick={() => void resetAll()}>reset</button>
    </>
  );
}

describe("settings store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    resetDisplayRuntimeForTests();
  });

  it("migrates legacy view keys into workspace defaults", () => {
    localStorage.setItem(LEGACY_PHOTO_VIEW_KEY, "list");
    localStorage.setItem(LEGACY_IMPORT_VIEW_KEY, "gallery");

    const settings = readSettings(localStorage);

    expect(settings.workspaceDefaults.photoView).toBe("list");
    expect(settings.workspaceDefaults.importView).toBe("gallery");
  });

  it("falls back safely when persisted settings are malformed", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, "not-json");
    const settings = readSettings(localStorage);
    expect(settings.global).toMatchObject({
      locale: "zh-CN",
      theme: "dark",
      density: "comfortable",
      motion: "system",
    });
  });

  it("persists global and workspace-scoped changes and applies theme attributes", async () => {
    render(
      <SettingsProvider>
        <Harness />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    fireEvent.click(screen.getByRole("button", { name: "list" }));

    await waitFor(() => {
      expect(screen.getByText("light:list:100:100")).toBeInTheDocument();
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(stored.global.theme).toBe("light");
    expect(stored.workspaces["id:one"].photoView).toBe("list");
  });

  it("normalizes cache quotas into supported workspace limits", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      workspaces: {
        "id:one": { cacheMaxMb: 999_999, cacheMaxImages: 0 },
      },
    }));

    const settings = readSettings(localStorage);
    expect(settings.workspaces["id:one"]).toMatchObject({
      cacheMaxMb: 16_384,
      cacheMaxImages: 1,
    });
  });

  it("migrates and normalizes version 1 display settings", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      global: {
        appScale: 204,
        textScale: {
          navigation: 78,
          header: "invalid",
          content: 50,
          detail: 999,
        },
      },
    }));

    const settings = readSettings(localStorage);
    expect(settings.version).toBe(2);
    expect(settings.global.appScale).toBe(DISPLAY_SCALE_LIMITS.app.maximum);
    expect(settings.global.textScale).toEqual({
      navigation: 80,
      header: 100,
      content: 75,
      detail: 150,
    });
  });

  it("persists display scales, exposes CSS variables, and resets them", async () => {
    render(
      <SettingsProvider>
        <Harness />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "scale" }));
    fireEvent.click(screen.getByRole("button", { name: "text" }));

    await waitFor(() => {
      expect(screen.getByText("dark:masonry:150:125")).toBeInTheDocument();
      expect(document.documentElement.style.zoom).toBe("1.5");
      expect(document.documentElement.style.getPropertyValue("--text-scale-navigation"))
        .toBe("1.25");
    });

    let stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(stored.global).toMatchObject({ appScale: 150 });
    expect(stored.global.textScale.navigation).toBe(125);

    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => {
      expect(screen.getByText("dark:masonry:100:100")).toBeInTheDocument();
      expect(document.documentElement.style.zoom).toBe("1");
    });
    stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(stored.version).toBe(2);
    expect(stored.global.appScale).toBe(100);
  });
});

