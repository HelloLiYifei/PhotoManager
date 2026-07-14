import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ImportWizard from "./ImportWizard";

const mocks = vi.hoisted(() => ({
  createAlbum: vi.fn(),
  detectCards: vi.fn(),
  getAlbums: vi.fn(),
  importPhotos: vi.fn(),
  listenToImportProgress: vi.fn(),
  loadPathPreview: vi.fn(),
  loadPathThumbnail: vi.fn(),
  scanCard: vi.fn(),
  selectDirectory: vi.fn(),
}));

vi.mock("../services/albumService", () => ({
  createAlbum: mocks.createAlbum,
  getAlbums: mocks.getAlbums,
}));

vi.mock("../services/importService", () => ({
  detectCards: mocks.detectCards,
  importPhotos: mocks.importPhotos,
  listenToImportProgress: mocks.listenToImportProgress,
  scanCard: mocks.scanCard,
}));

vi.mock("../services/workspaceService", () => ({
  selectDirectory: mocks.selectDirectory,
}));

vi.mock("../lib/thumbnailLoader", () => ({
  loadPathThumbnail: mocks.loadPathThumbnail,
}));

vi.mock("../lib/previewLoader", () => ({
  loadPathPreview: mocks.loadPathPreview,
}));

vi.mock("./timeline/media", () => ({
  LazyThumbnail: ({ alt, fit }) => <img alt={alt} src="thumbnail.jpg" data-fit={fit} />,
}));

const freshOne = {
  absolutePath: "D:/DCIM/IMG_0001.JPG",
  relativePath: "IMG_0001.JPG",
  dateTaken: "2026-07-01",
  size: 2 * 1024 * 1024,
  isRaw: false,
  alreadyImported: false,
};

const freshTwo = {
  absolutePath: "D:/DCIM/IMG_0002.NEF",
  relativePath: "IMG_0002.NEF",
  dateTaken: "2026-07-02",
  size: 20 * 1024 * 1024,
  isRaw: true,
  alreadyImported: false,
};

const duplicate = {
  absolutePath: "D:/DCIM/IMG_0003.JPG",
  relativePath: "IMG_0003.JPG",
  dateTaken: "2026-07-03",
  size: 3 * 1024 * 1024,
  isRaw: false,
  alreadyImported: true,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderWizard(props = {}) {
  return render(
    <ImportWizard
      onClose={vi.fn()}
      onImportComplete={vi.fn()}
      {...props}
    />,
  );
}

describe("ImportWizard phase-four integration", () => {
  let progressHandler;
  let unlisten;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    progressHandler = null;
    unlisten = vi.fn();
    mocks.detectCards.mockResolvedValue([
      { path: "D:/DCIM", label: "CAMERA", driveLetter: "D:" },
    ]);
    mocks.scanCard.mockResolvedValue([freshOne, freshTwo, duplicate]);
    mocks.getAlbums.mockResolvedValue([
      { id: "album-default", name: "默认相册" },
      { id: "album-trip", name: "旅行" },
    ]);
    mocks.createAlbum.mockResolvedValue({ id: "album-new", name: "夜景" });
    mocks.importPhotos.mockResolvedValue(2);
    mocks.listenToImportProgress.mockImplementation(async (handler) => {
      progressHandler = handler;
      return unlisten;
    });
    mocks.loadPathPreview.mockResolvedValue("preview.jpg");
    mocks.selectDirectory.mockResolvedValue(null);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({
          coords: { latitude: 31.2304, longitude: 121.4737 },
        })),
      },
    });
  });

  it("migrates icons, keeps only three previews, and protects duplicates while brushing", async () => {
    localStorage.setItem("photomanager-import-view", "icons");
    renderWizard();

    const first = await screen.findByRole("gridcell", { name: "IMG_0001.JPG" });
    const second = screen.getByRole("gridcell", { name: "IMG_0002.NEF" });
    expect(localStorage.getItem("photomanager-import-view")).toBe("masonry");
    expect(screen.getAllByRole("button", { name: /视图$/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "图标视图" })).not.toBeInTheDocument();
    expect(screen.getByText(/已识别 1 张重复照片/)).toBeInTheDocument();
    expect(screen.getByText("2 张待导入")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /旅行/ }));
    fireEvent.mouseDown(first);
    fireEvent.mouseEnter(second);
    fireEvent.mouseUp(window);
    expect(await screen.findAllByText("相册 · 旅行")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
    expect(screen.getByRole("table", { name: "存储卡照片列表" })).toBeInTheDocument();
    expect(localStorage.getItem("photomanager-import-view")).toBe("list");

    fireEvent.click(screen.getByRole("button", { name: "画廊视图" }));
    const importGallery = screen.getByRole("region", { name: "导入照片画廊" });
    expect(importGallery).toBeInTheDocument();
    expect(importGallery.closest('[data-view-mode="gallery"]')).not.toBeNull();
    fireEvent.keyDown(importGallery, {
      key: "End",
    });
    expect(screen.getByText("IMG_0003.JPG")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "瀑布流视图" }));
    fireEvent.click(screen.getByRole("button", { name: /隐藏已导入/ }));
    expect(screen.queryByRole("gridcell", { name: "IMG_0003.JPG" })).not.toBeInTheDocument();
  });

  it("uses the configuration drawer and shared album dialog", async () => {
    mocks.getAlbums
      .mockResolvedValueOnce([{ id: "album-trip", name: "旅行" }])
      .mockResolvedValueOnce([
        { id: "album-trip", name: "旅行" },
        { id: "album-new", name: "夜景" },
      ]);
    renderWizard();
    await screen.findByRole("gridcell", { name: "IMG_0001.JPG" });

    fireEvent.click(screen.getByRole("button", { name: "导入配置" }));
    expect(screen.getByRole("button", { name: "关闭导入配置" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "来源路径" }), {
      target: { value: "F:/Photos" },
    });
    expect(mocks.scanCard).not.toHaveBeenCalledWith({ path: "F:/Photos" });
    fireEvent.click(screen.getByRole("button", { name: "扫描来源路径" }));
    await waitFor(() => expect(mocks.scanCard).toHaveBeenCalledWith({
      path: "F:/Photos",
    }));

    mocks.selectDirectory.mockResolvedValueOnce("G:/Browsed Photos");
    fireEvent.click(screen.getAllByRole("button", { name: "浏览" })[0]);
    await waitFor(() => expect(screen.getByRole("textbox", {
      name: "来源路径",
    })).toHaveValue("G:/Browsed Photos"));
    expect(mocks.scanCard).toHaveBeenCalledWith({ path: "G:/Browsed Photos" });

    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    const dialog = screen.getByRole("dialog", { name: "创建新相册" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "相册名称" }), {
      target: { value: "夜景" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建相册" }));

    await waitFor(() => expect(mocks.createAlbum).toHaveBeenCalledWith({
      name: "夜景",
      description: null,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "创建新相册" })).not.toBeInTheDocument());
    expect(await screen.findByRole("option", { name: /夜景/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭导入配置面板" }));
    expect(screen.getByRole("button", { name: "导入配置" })).toBeInTheDocument();
  });

  it("preserves an unsubmitted source draft when card detection finishes late", async () => {
    const pendingCards = deferred();
    mocks.detectCards.mockReturnValue(pendingCards.promise);
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "导入配置" }));
    const sourceInput = screen.getByRole("textbox", { name: "来源路径" });
    fireEvent.change(sourceInput, { target: { value: "F:/Manual Photos" } });

    await act(async () => {
      pendingCards.resolve([
        { path: "D:/DCIM", label: "CAMERA", driveLetter: "D:" },
      ]);
      await pendingCards.promise;
    });
    await waitFor(() => expect(mocks.scanCard).toHaveBeenCalledWith({
      path: "D:/DCIM",
    }));

    expect(sourceInput).toHaveValue("F:/Manual Photos");
    fireEvent.click(screen.getByRole("button", { name: "扫描来源路径" }));
    await waitFor(() => expect(mocks.scanCard).toHaveBeenCalledWith({
      path: "F:/Manual Photos",
    }));
  });

  it("submits GPS, backup and progress while preserving original filenames", async () => {
    const pendingImport = deferred();
    const onClose = vi.fn();
    const onImportComplete = vi.fn();
    mocks.importPhotos.mockReturnValue(pendingImport.promise);
    renderWizard({ onClose, onImportComplete });
    await screen.findByRole("gridcell", { name: "IMG_0001.JPG" });

    expect(screen.queryByRole("combobox", { name: "重命名规则" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "备份目录（可选）" }), {
      target: { value: "E:/Backup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始导入 2 张" }));

    await waitFor(() => expect(mocks.importPhotos).toHaveBeenCalledWith({
      imports: [
        { absolute_path: freshOne.absolutePath, album_name: "默认相册" },
        { absolute_path: freshTwo.absolutePath, album_name: "默认相册" },
      ],
      backupPath: "E:/Backup",
      currentLocation: { latitude: 31.2304, longitude: 121.4737 },
    }));
    expect(screen.getByRole("dialog", { name: "照片导入进度" })).toBeInTheDocument();

    act(() => {
      progressHandler({
        payload: { copied: 1, total: 2, currentFile: "IMG_0002.NEF" },
      });
    });
    const progressDialog = screen.getByRole("dialog", { name: "照片导入进度" });
    expect(within(progressDialog).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(within(progressDialog).getByText(/IMG_0002.NEF/)).toBeInTheDocument();

    await act(async () => {
      pendingImport.resolve(2);
      await pendingImport.promise;
    });
    await waitFor(() => expect(onImportComplete).toHaveBeenCalledWith(2));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
