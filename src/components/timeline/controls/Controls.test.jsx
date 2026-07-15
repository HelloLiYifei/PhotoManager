import { fireEvent, render, screen } from "@testing-library/react";
import BatchActionBar from "./BatchActionBar";
import MoveAlbumDialog from "./MoveAlbumDialog";
import PhotoInspector from "./PhotoInspector";
import TimelineToolbar from "./TimelineToolbar";

describe("TimelineToolbar", () => {
  it("offers exactly the three supported views and reports toolbar changes", () => {
    const onSearchChange = vi.fn();
    const onTagFilterChange = vi.fn();
    const onRatingFilterChange = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <TimelineToolbar
        searchQuery=""
        allTags={["旅行", "家庭"]}
        viewMode="masonry"
        onSearchChange={onSearchChange}
        onTagFilterChange={onTagFilterChange}
        onRatingFilterChange={onRatingFilterChange}
        onViewModeChange={onViewModeChange}
      />,
    );

    expect(screen.getAllByRole("button", { name: /视图$/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "图标视图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "瀑布流视图" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索照片" }), {
      target: { value: "富士" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "按标签筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "旅行" }));
    fireEvent.click(screen.getByRole("combobox", { name: "按评分筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "3 星及以上" }));
    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));

    expect(onSearchChange).toHaveBeenCalledWith("富士");
    expect(onTagFilterChange).toHaveBeenCalledWith("旅行");
    expect(onRatingFilterChange).toHaveBeenCalledWith(3);
    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });

  it("exposes a closable narrow-window filter panel", () => {
    const onFiltersOpenChange = vi.fn();
    render(
      <TimelineToolbar
        tagFilter="家庭"
        ratingFilter={3}
        filtersOpen
        onFiltersOpenChange={onFiltersOpenChange}
      />,
    );

    expect(screen.getByRole("dialog", { name: "筛选照片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "筛选，已启用 2 项" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFiltersOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "关闭筛选面板" }));
    expect(onFiltersOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("PhotoInspector", () => {
  const photo = {
    id: "photo-1",
    filename: "山谷.jpg",
    path: "旅行/山谷.jpg",
    fileType: "JPEG",
    fileSize: 2 * 1024 * 1024,
    width: 4000,
    height: 3000,
    dateTaken: "2026-07-01",
    cameraMake: "FUJIFILM",
    cameraModel: "X-T5",
    rating: 2,
  };

  it("shows metadata and reports rating, tag, and close actions", () => {
    const onRatingChange = vi.fn();
    const onNewTagInputChange = vi.fn();
    const onAddTag = vi.fn();
    const onRemoveTag = vi.fn();
    const onClose = vi.fn();

    render(
      <PhotoInspector
        photo={photo}
        tags={["旅行"]}
        newTagInput="风景"
        onRatingChange={onRatingChange}
        onNewTagInputChange={onNewTagInputChange}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("complementary", { name: "照片属性面板" })).toHaveTextContent("4000 × 3000");
    expect(screen.getByRole("complementary", { name: "照片属性面板" })).toHaveTextContent("2.00 MB");

    fireEvent.click(screen.getByRole("button", { name: "设为 3 星" }));
    fireEvent.click(screen.getByRole("button", { name: "清除评分" }));
    expect(onRatingChange).toHaveBeenNthCalledWith(1, 3);
    expect(onRatingChange).toHaveBeenNthCalledWith(2, 0);

    fireEvent.change(screen.getByRole("textbox", { name: "新标签" }), {
      target: { value: "夜景" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.click(screen.getByRole("button", { name: "删除标签 旅行" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭照片属性面板" }));

    expect(onNewTagInputChange).toHaveBeenCalledWith("夜景");
    expect(onAddTag).toHaveBeenCalledOnce();
    expect(onRemoveTag).toHaveBeenCalledWith("旅行");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render without a selected photo", () => {
    render(<PhotoInspector photo={null} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("BatchActionBar", () => {
  it("covers every normal-view batch action", () => {
    const callbacks = {
      onInspect: vi.fn(),
      onFavorite: vi.fn(),
      onCompare: vi.fn(),
      onMove: vi.fn(),
      onAddTag: vi.fn(),
      onExport: vi.fn(),
      onDelete: vi.fn(),
    };

    render(<BatchActionBar selectedCount={3} compareActive {...callbacks} />);

    ["属性", "收藏", "对比", "移动", "贴标", "导出", "删除"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name }));
    });

    Object.values(callbacks).forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "对比" })).toHaveAttribute("aria-pressed", "true");
  });

  it("covers trash restore, permanent delete, and empty actions", () => {
    const onRestore = vi.fn();
    const onPermanentDelete = vi.fn();
    const onEmptyTrash = vi.fn();
    const onInspect = vi.fn();
    const { rerender } = render(
      <BatchActionBar
        currentView="trash"
        totalCount={4}
        onInspect={onInspect}
        onRestore={onRestore}
        onPermanentDelete={onPermanentDelete}
        onEmptyTrash={onEmptyTrash}
      />,
    );

    expect(screen.getByRole("button", { name: "还原" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "永久删除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "属性" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "清空垃圾桶" }));
    expect(onEmptyTrash).toHaveBeenCalledOnce();

    rerender(
      <BatchActionBar
        currentView="trash"
        selectedCount={2}
        totalCount={4}
        onInspect={onInspect}
        onRestore={onRestore}
        onPermanentDelete={onPermanentDelete}
        onEmptyTrash={onEmptyTrash}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "还原" }));
    fireEvent.click(screen.getByRole("button", { name: "永久删除" }));
    fireEvent.click(screen.getByRole("button", { name: "属性" }));
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onPermanentDelete).toHaveBeenCalledOnce();
    expect(onInspect).toHaveBeenCalledOnce();
  });
});

describe("MoveAlbumDialog", () => {
  it("selects an album and closes with Escape", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MoveAlbumDialog
        open
        selectedCount={2}
        albums={[{ id: "album-1", name: "旅行", photoCount: 12 }]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "移动到相册" })).toHaveTextContent("2 张照片");
    fireEvent.click(screen.getByRole("button", { name: /旅行/ }));
    expect(onSelect).toHaveBeenCalledWith("album-1");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
