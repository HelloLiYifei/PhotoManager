import { fireEvent, render, screen } from "@testing-library/react";
import { GalleryView, ListView, MasonryView } from ".";

vi.mock("../media", () => ({
  GalleryPreviewImage: ({ alt }) => <img alt={alt} src="gallery-preview.jpg" />,
  ThumbnailImage: ({ alt }) => <img alt={alt} src="thumbnail.jpg" />,
}));

const photos = [
  {
    id: 1,
    filename: "海边.jpg",
    fileType: "JPG",
    fileSize: 2 * 1024 * 1024,
    width: 4000,
    height: 3000,
    dateTaken: "2026-07-01",
    isFavorite: true,
    rating: 5,
  },
  {
    id: 2,
    filename: "树林.raw",
    fileType: "RAW",
    fileSize: 8 * 1024 * 1024,
    width: 6000,
    height: 4000,
    dateTaken: null,
    isFavorite: false,
    rating: 0,
  },
  {
    id: 3,
    filename: "城市.png",
    fileType: "PNG",
    fileSize: 1024 * 1024,
    width: 1920,
    height: 1080,
    dateTaken: "2026-07-03",
    isFavorite: false,
    rating: 3,
  },
];

describe("MasonryView", () => {
  it("exposes selection and compare state and keeps mouse interactions", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();

    render(
      <MasonryView
        photos={photos}
        selectedIds={[1]}
        compareLockedId={1}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    const first = screen.getByRole("gridcell", { name: "海边.jpg" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("data-compare-base", "true");
    expect(screen.getByText("对比基准")).toBeInTheDocument();

    fireEvent.click(first, { ctrlKey: true, detail: 1 });
    expect(onSelect).toHaveBeenCalledWith(photos[0], expect.any(Object));
    expect(onSelect.mock.calls[0][1].ctrlKey).toBe(true);

    fireEvent.doubleClick(first);
    expect(onOpen).toHaveBeenCalledWith(photos, 0);
  });

  it("selects with Space and opens with Enter", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <MasonryView
        photos={photos}
        selectedIds={[]}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    const second = screen.getByRole("gridcell", { name: "树林.raw" });
    fireEvent.keyDown(second, { key: " ", metaKey: true });
    expect(onSelect).toHaveBeenCalledWith(photos[1], expect.any(Object));
    expect(onSelect.mock.calls[0][1].metaKey).toBe(true);

    fireEvent.keyDown(second, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(photos, 1);
  });
});

describe("ListView", () => {
  it("renders metadata and supports keyboard and mouse opening", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <ListView
        photos={photos}
        selectedIds={[2]}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole("table", { name: "照片列表" })).toBeInTheDocument();
    expect(screen.getByText("8.00 MB")).toBeInTheDocument();
    expect(screen.getByText("6000 × 4000")).toBeInTheDocument();

    const second = screen.getByRole("row", { name: "树林.raw" });
    expect(second).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(second, { key: " ", ctrlKey: true });
    expect(onSelect.mock.calls[0][1].ctrlKey).toBe(true);

    fireEvent.keyDown(second, { key: "Enter" });
    fireEvent.doubleClick(second);
    expect(onOpen).toHaveBeenNthCalledWith(1, photos, 1);
    expect(onOpen).toHaveBeenNthCalledWith(2, photos, 1);
  });
});

describe("GalleryView", () => {
  it("navigates by keyboard and stage controls and opens the active photo", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(
      <GalleryView
        photos={photos}
        activePhoto={photos[0]}
        selectedIds={[1]}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    const gallery = screen.getByLabelText("画廊照片预览");
    fireEvent.keyDown(gallery, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(photos[1], expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: "下一张" }));
    expect(onSelect).toHaveBeenLastCalledWith(photos[1], expect.any(Object));

    rerender(
      <GalleryView
        photos={photos}
        activePhoto={photos[1]}
        selectedIds={[2]}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    fireEvent.keyDown(gallery, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(photos[2], expect.any(Object));

    fireEvent.keyDown(gallery, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(photos, 1);
  });

  it("supports Ctrl/Meta selection and Lightbox opening from film items", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <GalleryView
        photos={photos}
        activePhoto={photos[0]}
        selectedIds={[1]}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    const filmItem = screen.getByRole("option", { name: "树林.raw" });
    fireEvent.click(filmItem, { ctrlKey: true, detail: 1 });
    expect(onSelect.mock.calls[0][1].ctrlKey).toBe(true);

    fireEvent.keyDown(filmItem, { key: " ", metaKey: true });
    expect(onSelect.mock.calls[1][1].metaKey).toBe(true);

    fireEvent.keyDown(filmItem, { key: "Enter" });
    fireEvent.doubleClick(filmItem);
    expect(onOpen).toHaveBeenNthCalledWith(1, photos, 1);
    expect(onOpen).toHaveBeenNthCalledWith(2, photos, 1);
  });
});
