import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  LEGACY_IMPORT_VIEW_KEY,
  LEGACY_PHOTO_VIEW_KEY,
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
  readSettings,
  useSettings,
} from "./SettingsContext";

function Harness() {
  const { globalSettings, getWorkspaceSettings, updateGlobal, updateWorkspace } = useSettings();
  const workspace = { id: "one", path: "D:/Photos" };
  const scoped = getWorkspaceSettings(workspace);
  return (
    <>
      <output>{globalSettings.theme}:{scoped.photoView}</output>
      <button type="button" onClick={() => updateGlobal({ theme: "light" })}>light</button>
      <button type="button" onClick={() => updateWorkspace(workspace, { photoView: "list" })}>list</button>
    </>
  );
}

describe("settings store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
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

  it("persists global and workspace-scoped changes and applies theme attributes", () => {
    render(
      <SettingsProvider>
        <Harness />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    fireEvent.click(screen.getByRole("button", { name: "list" }));

    expect(screen.getByText("light:list")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
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
});

