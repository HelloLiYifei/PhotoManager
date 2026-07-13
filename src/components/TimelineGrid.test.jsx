import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TimelineGrid from "./TimelineGrid";

const mocks = vi.hoisted(() => ({
  addTagToPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  emptyTrashToRecycleBin: vi.fn(),
  exportPhotos: vi.fn(),
  getAlbums: vi.fn(),
  getAllTags: vi.fn(),
  getPhotoTags: vi.fn(),
  getPhotos: vi.fn(),
  loadPhotoPreview: vi.fn(),
  loadPhotoThumbnail: vi.fn(),
  movePhotosToAlbum: vi.fn(),
  permanentlyDeletePhotos: vi.fn(),
  removeTagFromPhoto: vi.fn(),
  restorePhotos: vi.fn(),
  selectDirectory: vi.fn(),
  toggleFavorite: vi.fn(),
  updateRating: vi.fn(),
}));

vi.mock("../services/albumService", () => ({
  getAlbums: mocks.getAlbums,
  movePhotosToAlbum: mocks.movePhotosToAlbum,
}));

vi.mock("../services/photoService", () => ({
  addTagToPhoto: mocks.addTagToPhoto,
  deletePhoto: mocks.deletePhoto,
  emptyTrashToRecycleBin: mocks.emptyTrashToRecycleBin,
  exportPhotos: mocks.exportPhotos,
  getAllTags: mocks.getAllTags,
  getPhotoTags: mocks.getPhotoTags,
  getPhotos: mocks.getPhotos,
  permanentlyDeletePhotos: mocks.permanentlyDeletePhotos,
  removeTagFromPhoto: mocks.removeTagFromPhoto,
  restorePhotos: mocks.restorePhotos,
  toggleFavorite: mocks.toggleFavorite,
  updateRating: mocks.updateRating,
}));

vi.mock("../services/workspaceService", () => ({
  selectDirectory: mocks.selectDirectory,
}));

vi.mock("../lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: mocks.loadPhotoThumbnail,
}));

vi.mock("../lib/previewLoader", () => ({
  loadPhotoPreview: mocks.loadPhotoPreview,
}));

vi.mock("./timeline/media", () => ({
  ThumbnailImage: ({ alt }) => <img alt={alt} src="thumbnail.jpg" />,
  GalleryPreviewImage: ({ alt }) => <img alt={alt} src="preview.jpg" />,
  ComparePreviewImage: () => <img alt="对比锁定图" src="preview.jpg" />,
}));

const photos = [
  {
    id: "photo-1",
    filename: "海边.jpg",
    path: "旅行/海边.jpg",
    fileType: "JPG",
    fileSize: 2 * 1024 * 1024,
    width: 4000,
    height: 3000,
    dateTaken: "2026-07-01",
    isFavorite: false,
    rating: 2,
  },
  {
    id: "photo-2",
    filename: "树林.raw",
    path: "旅行/树林.raw",
    fileType: "RAW",
    fileSize: 8 * 1024 * 1024,
    width: 6000,
    height: 4000,
    dateTaken: "2026-07-02",
    isFavorite: true,
    rating: 4,
  },
];

function renderTimeline(props = {}) {
  return render(
    <TimelineGrid
      currentView="album"
      albumId="album-1"
      refreshTrigger={0}
      onPhotoClick={vi.fn()}
      onPhotosUpdated={vi.fn()}
      {...props}
    />,
  );
}

function RefreshingTimeline() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <TimelineGrid
      currentView="album"
      albumId="album-1"
      refreshTrigger={refreshTrigger}
      onPhotoClick={vi.fn()}
      onPhotosUpdated={() => setRefreshTrigger((value) => value + 1)}
    />
  );
}

function installMatchMedia(matches) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("TimelineGrid phase-three integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMedia(false);
    localStorage.clear();
    mocks.getPhotos.mockResolvedValue(photos);
    mocks.getAllTags.mockResolvedValue(["旅行", "风景"]);
    mocks.getPhotoTags.mockImplementation(({ photoId }) =>
      Promise.resolve([photoId === "photo-2" ? "树林" : "海边"]),
    );
    mocks.getAlbums.mockResolvedValue([{ id: "album-2", name: "精选", photoCount: 4 }]);
    mocks.loadPhotoThumbnail.mockResolvedValue("asset://thumbnail");
    mocks.loadPhotoPreview.mockResolvedValue("asset://preview");
    mocks.selectDirectory.mockResolvedValue("D:/Exports");
    for (const name of [
      "addTagToPhoto",
      "deletePhoto",
      "emptyTrashToRecycleBin",
      "exportPhotos",
      "movePhotosToAlbum",
      "permanentlyDeletePhotos",
      "removeTagFromPhoto",
      "restorePhotos",
      "toggleFavorite",
      "updateRating",
    ]) {
      mocks[name].mockResolvedValue(undefined);
    }
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("旅拍");
  });

  it("migrates icons, persists the three views, and supports keyboard selection and Lightbox", async () => {
    const onPhotoClick = vi.fn();
    localStorage.setItem("photomanager-photo-view", "icons");
    const { container } = renderTimeline({ onPhotoClick });

    const first = await screen.findByRole("gridcell", { name: "海边.jpg" });
    const second = screen.getByRole("gridcell", { name: "树林.raw" });
    await screen.findByRole("option", { name: "旅行" });
    expect(localStorage.getItem("photomanager-photo-view")).toBe("masonry");
    expect(screen.getAllByRole("button", { name: /视图$/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "图标视图" })).not.toBeInTheDocument();

    fireEvent.keyDown(first, { key: " " });
    expect(await screen.findByRole("complementary", { name: "照片属性面板" })).toBeInTheDocument();
    fireEvent.keyDown(second, { key: " ", ctrlKey: true });
    expect(screen.getByText("已选择 2 张照片")).toBeInTheDocument();
    await screen.findByRole("button", { name: "删除标签 树林" });
    fireEvent.click(screen.getByRole("button", { name: "关闭照片属性面板" }));
    expect(screen.queryByRole("complementary", { name: "照片属性面板" })).not.toBeInTheDocument();
    expect(screen.getByText("已选择 2 张照片")).toBeInTheDocument();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(onPhotoClick).toHaveBeenCalledWith(photos, 1);

    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
    expect(container.querySelector("[data-view-mode]"))
      .toHaveAttribute("data-view-mode", "list");
    expect(localStorage.getItem("photomanager-photo-view")).toBe("list");
    expect(screen.getByRole("table", { name: "照片列表" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "画廊视图" }));
    expect(screen.getByLabelText("画廊照片预览")).toBeInTheDocument();
    expect(container.querySelector(".finder-gallery-caption")).toContainElement(
      screen.getByRole("region", { name: "批量操作" }),
    );
    expect(localStorage.getItem("photomanager-photo-view")).toBe("gallery");

    fireEvent.click(screen.getByRole("button", { name: "瀑布流视图" }));
    expect(screen.getByRole("grid", { name: "瀑布流照片" })).toBeInTheDocument();
    expect(localStorage.getItem("photomanager-photo-view")).toBe("masonry");
  });

  it("wires rating and every normal-view batch operation", async () => {
    renderTimeline();
    fireEvent.click(await screen.findByRole("gridcell", { name: "海边.jpg" }), { detail: 1 });

    fireEvent.click(screen.getByRole("button", { name: "设为 5 星" }));
    await waitFor(() => expect(mocks.updateRating).toHaveBeenCalledWith({ id: "photo-1", rating: 5 }));

    fireEvent.click(screen.getByRole("button", { name: "收藏" }));
    await waitFor(() => expect(mocks.toggleFavorite).toHaveBeenCalledWith({
      id: "photo-1",
      isFavorite: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "贴标" }));
    await waitFor(() => expect(mocks.addTagToPhoto).toHaveBeenCalledWith({
      photoId: "photo-1",
      tagName: "旅拍",
    }));

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    await waitFor(() => expect(mocks.exportPhotos).toHaveBeenCalledWith({
      photoIds: ["photo-1"],
      destDir: "D:/Exports",
    }));

    fireEvent.click(screen.getByRole("button", { name: "对比" }));
    expect(await screen.findByRole("region", { name: "照片对比基准" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出照片对比" }));

    fireEvent.click(screen.getByRole("button", { name: "移动" }));
    const albumButton = await screen.findByRole("button", { name: /精选/ });
    fireEvent.click(albumButton);
    await waitFor(() => expect(mocks.movePhotosToAlbum).toHaveBeenCalledWith({
      photoIds: ["photo-1"],
      targetAlbumId: "album-2",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "移动到相册" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("gridcell", { name: "海边.jpg" }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(mocks.deletePhoto).toHaveBeenCalledWith({
      id: "photo-1",
      isDeleted: true,
    }));
  });

  it("keeps the photo inspector open when rating triggers a refresh", async () => {
    render(<RefreshingTimeline />);
    fireEvent.click(await screen.findByRole("gridcell", { name: "海边.jpg" }), { detail: 1 });

    fireEvent.click(screen.getByRole("button", { name: "设为 5 星" }));

    await waitFor(() => expect(mocks.updateRating).toHaveBeenCalledWith({
      id: "photo-1",
      rating: 5,
    }));
    await waitFor(() => expect(mocks.getPhotos).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("complementary", { name: "照片属性面板" })).toBeInTheDocument();
    expect(screen.getByText("已选择 1 张照片")).toBeInTheDocument();
  });

  it("keeps narrow-window selection usable until the property drawer is requested", async () => {
    installMatchMedia(true);
    const onPhotoClick = vi.fn();
    renderTimeline({ onPhotoClick });

    const first = await screen.findByRole("gridcell", { name: "海边.jpg" });
    fireEvent.click(first, { detail: 1 });
    expect(screen.queryByRole("complementary", { name: "照片属性面板" })).not.toBeInTheDocument();
    expect(screen.getByText("已选择 1 张照片")).toBeInTheDocument();

    fireEvent.doubleClick(first);
    expect(onPhotoClick).toHaveBeenCalledWith(photos, 0);

    fireEvent.click(screen.getByRole("button", { name: "属性" }));
    expect(await screen.findByRole("complementary", { name: "照片属性面板" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭照片属性面板" }));
    expect(screen.getByText("已选择 1 张照片")).toBeInTheDocument();
  });

  it("wires trash restore, permanent deletion, and empty-trash flows", async () => {
    renderTimeline({ currentView: "trash", albumId: null });
    const first = await screen.findByRole("gridcell", { name: "海边.jpg" });

    fireEvent.click(first, { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "还原" }));
    await waitFor(() => expect(mocks.restorePhotos).toHaveBeenCalledWith({ ids: ["photo-1"] }));

    fireEvent.click(first, { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "永久删除" }));
    await waitFor(() => expect(mocks.permanentlyDeletePhotos).toHaveBeenCalledWith({
      ids: ["photo-1"],
    }));

    fireEvent.click(screen.getByRole("button", { name: "清空垃圾桶" }));
    await waitFor(() => expect(mocks.emptyTrashToRecycleBin).toHaveBeenCalledOnce());
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(mocks.getPhotos).toHaveBeenCalledWith(expect.objectContaining({ deletedOnly: true }));
  });
});
