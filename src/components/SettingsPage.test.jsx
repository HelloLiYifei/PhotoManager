import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { clearWorkspaceCache, getWorkspaceStorageStats } from "../services/settingsService";
import { selectDirectory } from "../services/workspaceService";
import { SettingsProvider } from "../settings";
import { GlobalDialogProvider } from "./ui";
import SettingsPage from "./SettingsPage";

vi.mock("../services/settingsService", () => ({
  clearWorkspaceCache: vi.fn(),
  getWorkspaceStorageStats: vi.fn(),
  listenToScanProgress: vi.fn().mockResolvedValue(() => {}),
  scanWorkspace: vi.fn(),
}));

vi.mock("../services/workspaceService", () => ({
  selectDirectory: vi.fn(),
}));

const workspace = { id: "workspace-1", name: "摄影库", path: "D:/Photos" };

function renderPage() {
  return render(
    <SettingsProvider>
      <I18nProvider>
        <GlobalDialogProvider>
          <SettingsPage workspace={workspace} />
        </GlobalDialogProvider>
      </I18nProvider>
    </SettingsProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getWorkspaceStorageStats.mockResolvedValue({
      photoCount: 12,
      trashCount: 2,
      albumCount: 3,
      originalBytes: 2048,
      databaseBytes: 1024,
      thumbnailCache: { fileCount: 4, bytes: 4096 },
      importPreviewCache: { fileCount: 1, bytes: 512 },
    });
    clearWorkspaceCache.mockResolvedValue({ filesRemoved: 4, bytesFreed: 4096 });
    selectDirectory.mockResolvedValue("E:/Backup");
  });

  it("updates appearance and language immediately", async () => {
    renderPage();
    await waitFor(() => expect(getWorkspaceStorageStats).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "浅色" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    fireEvent.click(screen.getByRole("combobox", { name: "界面语言" }));
    fireEvent.click(screen.getByRole("option", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en-US");
  });

  it("persists workspace import preferences and displays storage statistics", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "浏览与导入" }));
    fireEvent.click(screen.getByRole("switch", { name: "自动选中存储卡" }));
    fireEvent.click(screen.getByRole("button", { name: /^浏览$/ }));

    await waitFor(() => expect(selectDirectory).toHaveBeenCalledOnce());
    const stored = JSON.parse(localStorage.getItem("photomanager-settings-v1"));
    expect(stored.workspaces["id:workspace-1"]).toMatchObject({
      autoSelectDetectedSource: false,
      backupPath: "E:/Backup",
    });

    fireEvent.click(screen.getByRole("button", { name: "工作区" }));
    expect(screen.getByText("D:/Photos")).toBeInTheDocument();
    expect(await screen.findByText("4 KB")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("confirms and clears only the selected cache", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "工作区" }));
    const clearButtons = screen.getAllByRole("button", { name: "清除" });
    fireEvent.click(clearButtons[0]);
    const dialog = screen.getByRole("alertdialog", { name: "清理可再生缓存" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "清除" }));
    await waitFor(() => {
      expect(clearWorkspaceCache).toHaveBeenCalledWith({ kind: "thumbnails" });
    });
  });
});
