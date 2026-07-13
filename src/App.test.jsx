import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { createAlbum, getAlbumSummaries } from "./services/albumService";
import { detectCards } from "./services/importService";
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

vi.mock("./lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: vi.fn().mockResolvedValue("asset://cover"),
}));

vi.mock("./components/WorkspaceSelector", () => ({
  default: () => <div role="status">正在检查工作区</div>,
}));

vi.mock("./components/TimelineGrid", () => ({
  default: ({ currentView, albumId }) => (
    <div data-testid="timeline-view">{currentView}:{albumId || "all"}</div>
  ),
}));

vi.mock("./components/MapView", () => ({
  default: () => <div>地图内容</div>,
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

    expect(await screen.findByRole("heading", { name: "相册" })).toBeInTheDocument();
    await waitFor(() => expect(getAlbumSummaries).toHaveBeenCalledTimes(1));

    fireEvent.click(
      await screen.findByRole("button", { name: "打开相册旅行，3张照片" }),
    );

    expect(screen.getByRole("heading", { name: "旅行" })).toBeInTheDocument();
    expect(screen.getByTestId("timeline-view")).toHaveTextContent("album:album-1");
  });

  it("uses a collapsed rail at compact widths and opens it as an overlay", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "相册" });

    const shell = document.querySelector(".app-shell");
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");

    fireEvent.click(document.querySelector(".page-header__sidebar-toggle"));
    expect(shell).toHaveAttribute("data-sidebar-mode", "overlay");

    fireEvent.click(document.querySelector(".app-shell__scrim"));
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");
  });

  it("uses the full sidebar on wide windows and allows manual collapsing", async () => {
    installMatchMedia(true);
    render(<App />);
    await screen.findByRole("heading", { name: "相册" });

    const shell = document.querySelector(".app-shell");
    expect(shell).toHaveAttribute("data-sidebar-mode", "expanded");

    fireEvent.click(document.querySelector(".page-header__sidebar-toggle"));
    expect(shell).toHaveAttribute("data-sidebar-mode", "collapsed");
  });

  it("shows service errors, retries, and creates an album without duplicate submission", async () => {
    getAlbumSummaries
      .mockRejectedValueOnce(new Error("读取相册失败"))
      .mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("读取相册失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("button", { name: "创建相册" })).toBeInTheDocument();

    const header = screen.getByRole("banner");
    fireEvent.click(within(header).getByRole("button", { name: "新建相册" }));
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

  it("shows semantic workspace information instead of a settings alert", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "相册" });

    fireEvent.click(screen.getByRole("button", { name: "工作区信息" }));
    const dialog = screen.getByRole("dialog", { name: "工作区信息" });
    expect(within(dialog).getByText("D:/Photos")).toBeInTheDocument();
    expect(within(dialog).getByText("物理目录直接映射")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog", { name: "工作区信息" })).not.toBeInTheDocument();
  });
});
