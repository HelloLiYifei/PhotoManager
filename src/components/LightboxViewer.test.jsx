import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LightboxViewer from "./LightboxViewer";
import {
  addTagToPhoto,
  deletePhoto,
  getPhotoTags,
  permanentlyDeletePhoto,
  removeTagFromPhoto,
  toggleFavorite,
  updateRating,
} from "../services/photoService";

vi.mock("../lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: vi.fn((id) => Promise.resolve(`thumbnail://${id}`)),
}));

vi.mock("../lib/previewLoader", () => ({
  loadPhotoPreview: vi.fn((id) => Promise.resolve(`preview://${id}`)),
  prefetchPhotoPreview: vi.fn(),
}));

vi.mock("../services/photoService", () => ({
  addTagToPhoto: vi.fn(() => Promise.resolve()),
  deletePhoto: vi.fn(() => Promise.resolve()),
  getPhotoTags: vi.fn(() => Promise.resolve(["旅行"])),
  permanentlyDeletePhoto: vi.fn(() => Promise.resolve()),
  removeTagFromPhoto: vi.fn(() => Promise.resolve()),
  toggleFavorite: vi.fn(() => Promise.resolve()),
  updateRating: vi.fn(() => Promise.resolve()),
}));

const photos = [
  {
    id: 1,
    filename: "one.jpg",
    path: "D:/Photos/one.jpg",
    fileSize: 1024 * 1024,
    width: 3000,
    height: 2000,
    rating: 2,
    isFavorite: false,
    isDeleted: false,
    latitude: 31.2304,
    longitude: 121.4737,
    cameraMake: "Example",
    cameraModel: "Camera 1",
  },
  {
    id: 2,
    filename: "two.jpg",
    path: "D:/Photos/two.jpg",
    fileSize: 2048,
    rating: 0,
    isFavorite: true,
    isDeleted: false,
  },
];

function mockViewport(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderLightbox(overrides = {}) {
  const props = {
    photosList: photos.map((photo) => ({ ...photo })),
    initialIndex: 0,
    onClose: vi.fn(),
    onPhotosUpdated: vi.fn(),
    onShowOnMap: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<LightboxViewer {...props} />) };
}

describe("LightboxViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewport(false);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    getPhotoTags.mockResolvedValue(["旅行"]);
  });

  it("supports keyboard navigation, zoom shortcuts and closing", async () => {
    const { props } = renderLightbox();

    expect(await screen.findByText("one.jpg")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("two.jpg")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "0" });
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText("one.jpg")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("updates the rating and favorite state through the unified toolbar", async () => {
    const { props } = renderLightbox();
    await screen.findByText("one.jpg");

    fireEvent.click(screen.getByRole("button", { name: "评为 4 星" }));
    await waitFor(() => expect(updateRating).toHaveBeenCalledWith({ id: 1, rating: 4 }));
    expect(screen.getByRole("button", { name: "评为 4 星" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "喜欢" }));
    await waitFor(() => expect(toggleFavorite).toHaveBeenCalledWith({ id: 1, isFavorite: true }));
    expect(screen.getByRole("button", { name: "已喜欢" })).toHaveAttribute("aria-pressed", "true");
    expect(props.onPhotosUpdated).toHaveBeenCalledTimes(2);
  });

  it("adds and removes tags from the information panel", async () => {
    renderLightbox();
    expect(await screen.findByText("旅行")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新标签"), { target: { value: "夜景" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(addTagToPhoto).toHaveBeenCalledWith({ photoId: 1, tagName: "夜景" }));
    expect(screen.getByText("夜景")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除标签 旅行" }));
    await waitFor(() => expect(removeTagFromPhoto).toHaveBeenCalledWith({ photoId: 1, tagName: "旅行" }));
    expect(screen.queryByText("旅行")).not.toBeInTheDocument();
  });

  it("opens the selected photo on the map", async () => {
    const { props } = renderLightbox();
    await screen.findByText("one.jpg");
    fireEvent.click(screen.getByRole("button", { name: /在地图中查看/ }));
    expect(props.onShowOnMap).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("uses a semantic information drawer in a narrow viewport", async () => {
    mockViewport(true);
    renderLightbox();

    expect(screen.queryByRole("heading", { name: "拍摄信息" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开照片信息" }));

    expect(await screen.findByRole("dialog", { name: "照片信息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "拍摄信息" })).toBeInTheDocument();
  });

  it("keeps trash, restore and permanent delete flows", async () => {
    const { rerender, props } = renderLightbox();
    await screen.findByText("one.jpg");
    fireEvent.click(screen.getByRole("button", { name: "移入回收站" }));
    await waitFor(() => expect(deletePhoto).toHaveBeenCalledWith({ id: 1, isDeleted: true }));

    const deletedPhoto = { ...photos[0], isDeleted: true };
    rerender(<LightboxViewer {...props} photosList={[deletedPhoto]} />);
    await screen.findByRole("button", { name: "永久删除" });
    fireEvent.click(screen.getByRole("button", { name: "永久删除" }));
    await waitFor(() => expect(permanentlyDeletePhoto).toHaveBeenCalledWith({ id: 1 }));
  });
});
