import { render, screen, waitFor } from "@testing-library/react";
import {
  ComparePreviewImage,
  GalleryPreviewImage,
  ThumbnailImage,
} from "./PhotoMedia";

const loaderMocks = vi.hoisted(() => ({
  loadPhotoPreview: vi.fn(),
  loadPhotoThumbnail: vi.fn(),
}));

vi.mock("../../../lib/previewLoader", () => ({
  loadPhotoPreview: loaderMocks.loadPhotoPreview,
}));

vi.mock("../../../lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: loaderMocks.loadPhotoThumbnail,
}));

describe("timeline photo media", () => {
  beforeEach(() => {
    loaderMocks.loadPhotoPreview.mockReset();
    loaderMocks.loadPhotoThumbnail.mockReset();
  });

  it("loads a thumbnail and preserves its accessible name", async () => {
    loaderMocks.loadPhotoThumbnail.mockResolvedValue("photo-thumb.jpg");
    render(<ThumbnailImage id={7} alt="山景.jpg" fit="cover" />);

    expect(screen.getByRole("status", { name: "正在加载山景.jpg" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "山景.jpg" })).toHaveAttribute(
        "src",
        "photo-thumb.jpg",
      );
    });
    expect(loaderMocks.loadPhotoThumbnail).toHaveBeenCalledWith(7, 0);
  });

  it("falls back safely when thumbnail or preview loading fails", async () => {
    loaderMocks.loadPhotoThumbnail.mockRejectedValue(new Error("offline"));
    loaderMocks.loadPhotoPreview.mockRejectedValue(new Error("offline"));

    render(
      <>
        <ThumbnailImage id={8} alt="损坏照片" />
        <GalleryPreviewImage id={8} alt="损坏预览" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "损坏照片" })).toHaveAttribute(
        "src",
        "/placeholder.svg",
      );
      expect(screen.getByRole("img", { name: "损坏预览" })).toHaveAttribute(
        "src",
        "/placeholder.svg",
      );
    });
  });

  it("loads the compare preview", async () => {
    loaderMocks.loadPhotoPreview.mockResolvedValue("compare-preview.jpg");
    render(<ComparePreviewImage id={9} />);

    expect(screen.getByRole("status", { name: "正在读取高清对比图" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "对比锁定图" })).toHaveAttribute(
        "src",
        "compare-preview.jpg",
      );
    });
  });
});
