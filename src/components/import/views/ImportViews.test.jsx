import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPathThumbnail } from "../../../lib/thumbnailLoader";
import {
  getImportAlbumColor,
  ImportGalleryView,
  ImportListView,
  ImportMasonryView,
} from ".";

vi.mock("../../timeline/media", () => ({
  LazyThumbnail: ({ sourceKey, alt, fit, load }) => (
    <img
      src={`/thumb/${encodeURIComponent(sourceKey)}`}
      alt={alt}
      data-fit={fit}
      data-load={typeof load}
    />
  ),
}));

vi.mock("../../../lib/thumbnailLoader", () => ({
  loadPathThumbnail: vi.fn(),
}));

const photos = [
  {
    absolutePath: "D:/DCIM/first.jpg",
    relativePath: "DCIM/first.jpg",
    dateTaken: "2026-06-01",
    size: 2 * 1024 * 1024,
    isRaw: false,
    alreadyImported: false,
  },
  {
    absolutePath: "D:/DCIM/existing.jpg",
    relativePath: "DCIM/existing.jpg",
    dateTaken: "2026-06-02",
    size: 3 * 1024 * 1024,
    isRaw: false,
    alreadyImported: true,
  },
  {
    absolutePath: "D:/DCIM/raw.nef",
    relativePath: "DCIM/raw.nef",
    dateTaken: "2026-06-03",
    size: 20 * 1024 * 1024,
    isRaw: true,
    alreadyImported: false,
  },
];

function photoState(photo, focusedPath = photos[0].absolutePath) {
  return {
    isChecked: photo === photos[0],
    isFocused: photo.absolutePath === focusedPath,
    targetAlbum: photo === photos[0] ? "旅行" : null,
    albumColor: photo === photos[0] ? "#ef4444" : "transparent",
  };
}

describe("导入照片视图", () => {
  beforeEach(() => {
    loadPathThumbnail.mockReset();
  });

  it("瀑布流只渲染传入的可见批次并保护已导入照片", () => {
    const onActivatePhoto = vi.fn();
    const onBrushPhoto = vi.fn();
    const onBrushEnter = vi.fn();

    render(
      <ImportMasonryView
        photos={photos.slice(0, 2)}
        brushAlbum="旅行"
        getPhotoVisualState={photoState}
        onActivatePhoto={onActivatePhoto}
        onBrushPhoto={onBrushPhoto}
        onBrushEnter={onBrushEnter}
      />,
    );

    expect(screen.getAllByRole("gridcell")).toHaveLength(2);
    expect(screen.getByText("已存在")).toBeInTheDocument();
    expect(screen.getByText("相册 · 旅行")).toBeInTheDocument();

    const fresh = screen.getByRole("gridcell", { name: "DCIM/first.jpg" });
    fireEvent.mouseDown(fresh);
    fireEvent.mouseEnter(fresh);
    expect(onBrushPhoto).toHaveBeenCalledWith(photos[0], expect.anything());
    expect(onBrushEnter).toHaveBeenCalledWith(photos[0], expect.anything());

    const imported = screen.getByRole("gridcell", { name: "DCIM/existing.jpg" });
    fireEvent.mouseDown(imported);
    fireEvent.mouseEnter(imported);
    expect(onActivatePhoto).toHaveBeenLastCalledWith(photos[1]);
    expect(onBrushPhoto).toHaveBeenCalledTimes(1);
    expect(onBrushEnter).toHaveBeenCalledTimes(1);
  });

  it("列表保留导入状态、RAW 和文件信息，并支持键盘刷色", () => {
    const onBrushPhoto = vi.fn();
    render(
      <ImportListView
        photos={photos}
        brushAlbum="旅行"
        getPhotoVisualState={photoState}
        onBrushPhoto={onBrushPhoto}
      />,
    );

    expect(screen.getByRole("table", { name: "存储卡照片列表" })).toBeInTheDocument();
    expect(screen.getByText("已导入")).toBeInTheDocument();
    expect(screen.getByText("不导入")).toBeInTheDocument();
    expect(screen.getByText("20.00 MB")).toBeInTheDocument();
    expect(screen.getByText("RAW")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("row", { name: "DCIM/raw.nef" }), { key: " " });
    expect(onBrushPhoto).toHaveBeenCalledWith(photos[2], expect.anything());

    fireEvent.keyDown(screen.getByRole("row", { name: "DCIM/existing.jpg" }), { key: "Enter" });
    expect(onBrushPhoto).toHaveBeenCalledTimes(1);
  });

  it("画廊支持方向键、Home/End、滚轮和 Enter/Space 刷色", () => {
    const onBrushPhoto = vi.fn();

    function GalleryHarness() {
      const [activePath, setActivePath] = useState(photos[0].absolutePath);
      return (
        <ImportGalleryView
          photos={photos}
          activePath={activePath}
          brushAlbum="旅行"
          getPhotoVisualState={(photo) => photoState(photo, activePath)}
          onActivatePhoto={(photo) => setActivePath(photo.absolutePath)}
          onBrushPhoto={onBrushPhoto}
        />
      );
    }

    render(<GalleryHarness />);
    const gallery = screen.getByRole("region", { name: "导入照片画廊" });

    fireEvent.keyDown(gallery, { key: "ArrowRight" });
    expect(screen.getByText("DCIM/existing.jpg")).toBeInTheDocument();
    fireEvent.keyDown(gallery, { key: "Enter" });
    expect(onBrushPhoto).not.toHaveBeenCalled();

    fireEvent.keyDown(gallery, { key: "End" });
    expect(screen.getByText("DCIM/raw.nef")).toBeInTheDocument();
    fireEvent.keyDown(gallery, { key: " " });
    expect(onBrushPhoto).toHaveBeenCalledWith(photos[2], expect.anything());

    fireEvent.keyDown(gallery, { key: "Home" });
    const stage = screen.getByLabelText("DCIM/first.jpg", { selector: "div" });
    fireEvent.wheel(stage, { deltaY: 100 });
    expect(screen.getByText("DCIM/existing.jpg")).toBeInTheDocument();
  });

  it("缩略图把路径作为 sourceKey 交给共享加载组件", () => {
    render(<ImportMasonryView photos={[photos[0]]} getPhotoVisualState={photoState} />);
    const preview = screen.getByRole("img", { name: "DCIM/first.jpg" });
    expect(preview).toHaveAttribute("src", `/thumb/${encodeURIComponent(photos[0].absolutePath)}`);
    expect(preview).toHaveAttribute("data-load", "function");
  });

  it("沿用稳定的导入相册颜色规则", () => {
    expect(getImportAlbumColor("默认相册")).toBe("#3B82F6");
    expect(getImportAlbumColor("旅行")).toBe(getImportAlbumColor("旅行"));
    expect(getImportAlbumColor("旅行")).toMatch(/^#[0-9A-F]{6}$/);
  });
});
