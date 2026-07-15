import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { createAlbum, getAlbumSummaries } from "./services/albumService";
import { detectCards } from "./services/importService";
import { setWorkspaceCacheLimits } from "./services/settingsService";
import { getActiveWorkspace, getWorkspaces } from "./services/workspaceService";

vi.mock("./services/albumService", () => ({
  createAlbum: vi.fn(),
  getAlbumSummaries: vi.fn(),
}));

vi.mock("./services/importService", () => ({
  detectCards: vi.fn(),
}));

vi.mock("./services/workspaceService", () => ({
  getActiveWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
}));

vi.mock("./services/settingsService", () => ({
  clearWorkspaceCache: vi.fn(),
  getWorkspaceStorageStats: vi.fn().mockResolvedValue({
    photoCount: 0,
    trashCount: 0,
    albumCount: 0,
    originalBytes: 0,
    databaseBytes: 0,
    thumbnailCache: { fileCount: 0, bytes: 0 },
    importPreviewCache: { fileCount: 0, bytes: 0 },
  }),
  listenToScanProgress: vi.fn().mockResolvedValue(() => {}),
  scanWorkspace: vi.fn(),
  setWorkspaceCacheLimits: vi.fn().mockResolvedValue({ filesRemoved: 0, bytesFreed: 0 }),
}));

vi.mock("./lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: vi.fn().mockResolvedValue("asset://cover"),
}));

vi.mock("./components/WorkspaceSelector", () => ({
  default: () => <div role="status">正在检查工作区</div>,
}));

vi.mock("./components/TimelineGrid", () => ({
  default: ({ currentView, albumId, indexedPhotoIds = [] }) => (
    <div data-testid="timeline-view" data-photo-ids={indexedPhotoIds.join(",")}>
      {currentView}:{albumId || "all"}
    </div>
  ),
}));

vi.mock("./components/MapView", () => ({
  default: ({ onOpenTemporaryAlbum }) => (
    <div>
      地图内容
      <button
        type="button"
        onClick={() => onOpenTemporaryAlbum?.({
          photoIds: ["map-photo-1", "map-photo-2"],
          latitude: 30.25,
          longitude: 120.16,
        })}
      >
        打开地图临时相册
      </button>
    </div>
  ),
}));

vi.mock("./components/ImportWizard", () => ({
  default: () => <div>导入向导</div>,
}));

vi.mock("./components/LightboxViewer", () => ({
  default: () => <div>照片预览</div>,
}));

function installMatchMedia(matches) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("App phase-two shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMedia(false);
    getActiveWorkspace.mockResolvedValue("D:/Photos");
    getWorkspaces.mockResolvedValue([
      { id: "workspace-1", name: "摄影库", path: "D:/Photos", lastOpened: "2026-07-12" },
    ]);
    detectCards.mockResolvedValue([]);
    getAlbumSummaries.mockResolvedValue([]);
    createAlbum.mockResolvedValue({ id: "new-album", name: "杭州之旅" });
  });

  it("loads album summaries once and opens an album from the overview", async () => {
    getAlbumSummaries.mockResolvedValueOnce([
      {
        id: "album-1",
        name: "旅行",
        description: "夏季照片",
        photoCount: 3,
        coverPhotoId: null,
      },
    ]);

    render(<App />);

    expect(await screen.findByRole("main", { name: "相册" })).toBeInTheDocument();
    await waitFor(() => expect(setWorkspaceCacheLimits).toHaveBeenCalledWith({
      maxBytes: 512 * 1024 * 1024,
      maxFiles: 5_000,
    }));
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    await waitFor(() => expect(getAlbumSummaries).toHaveBeenCalledTimes(1));

    fireEvent.click(
      await screen.findByRole("button", { name: "打开相册旅行，3张照片" }),
    );

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(document.querySelector(".page-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-view")).toHaveTextContent("album:album-1");
  });

  it("uses a collapsed rail at compact widths and opens it as an overlay", async () => {
    render(<App />);
    await screen.findByRole("main", { name: "相册" });

    const shell = document.querySelector(".app-shell");
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");

    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(shell).toHaveAttribute("data-sidebar-mode", "overlay");

    fireEvent.click(document.querySelector(".app-shell__scrim"));
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");
  });

  it("uses the full sidebar on wide windows and allows manual collapsing", async () => {
    installMatchMedia(true);
    render(<App />);
    await screen.findByRole("main", { name: "相册" });

    const shell = document.querySelector(".app-shell");
    expect(shell).toHaveAttribute("data-sidebar-mode", "expanded");

    fireEvent.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");
  });

  it("opens a temporary map album backed only by photo IDs", async () => {
    render(<App />);
    await screen.findByRole("main", { name: "相册" });
    await waitFor(() => expect(getAlbumSummaries).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "地图" }));
    fireEvent.click(screen.getByRole("button", { name: "打开地图临时相册" }));

    expect(screen.getByRole("main", { name: "地图临时相册" })).toBeInTheDocument();
    expect(screen.getByText("此位置的 2 张照片")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-view")).toHaveTextContent("map-album:all");
    expect(screen.getByTestId("timeline-view")).toHaveAttribute(
      "data-photo-ids",
      "map-photo-1,map-photo-2",
    );

    fireEvent.click(screen.getByRole("button", { name: "返回地图" }));
    expect(screen.getByText("地图内容")).toBeInTheDocument();
  });

  it("shows service errors, retries, and creates an album without duplicate submission", async () => {
    getAlbumSummaries
      .mockRejectedValueOnce(new Error("读取相册失败"))
      .mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("读取相册失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    const createAlbumButton = await screen.findByRole("button", { name: "创建相册" });
    fireEvent.click(createAlbumButton);
    const dialog = screen.getByRole("dialog", { name: "创建新相册" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "相册名称" }), {
      target: { value: "杭州之旅" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建相册" }));

    await waitFor(() => {
      expect(createAlbum).toHaveBeenCalledTimes(1);
      expect(createAlbum).toHaveBeenCalledWith({ name: "杭州之旅", description: null });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getAlbumSummaries).toHaveBeenCalledTimes(3);
  });

  it("opens the settings page with current workspace information", async () => {
    render(<App />);
    await screen.findByRole("main", { name: "相册" });

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "工作区" }));
    await screen.findAllByText("0 B");
    expect(screen.getByText("D:/Photos")).toBeInTheDocument();
    expect(screen.getByText("物理目录直接映射")).toBeInTheDocument();
  });
});
