import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlbumsPage from "./AlbumsPage";

const thumbnailMocks = vi.hoisted(() => ({
  loadPhotoThumbnail: vi.fn(),
}));

vi.mock("../lib/thumbnailLoader", () => thumbnailMocks);

describe("AlbumsPage", () => {
  beforeEach(() => {
    thumbnailMocks.loadPhotoThumbnail.mockReset();
  });

  it("loads album covers and opens the selected album", async () => {
    const album = {
      id: 7,
      name: "杭州之旅",
      description: "夏季旅行",
      coverPhotoId: 42,
      photoCount: 18,
    };
    const onOpenAlbum = vi.fn();
    thumbnailMocks.loadPhotoThumbnail.mockResolvedValue("data:image/jpeg;base64,cover");

    render(
      <AlbumsPage
        albums={[album]}
        onOpenAlbum={onOpenAlbum}
        onCreateAlbum={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("杭州之旅的封面")).toHaveAttribute(
        "src",
        "data:image/jpeg;base64,cover",
      );
    });
    expect(thumbnailMocks.loadPhotoThumbnail).toHaveBeenCalledWith(42, 1);

    fireEvent.click(screen.getByRole("button", { name: "打开相册杭州之旅，18张照片" }));
    expect(onOpenAlbum).toHaveBeenCalledWith(album);
  });

  it("offers creation from the empty state", () => {
    const onCreateAlbum = vi.fn();
    render(<AlbumsPage albums={[]} onCreateAlbum={onCreateAlbum} />);

    expect(screen.getByText("还没有相册")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "创建相册" }));
    expect(onCreateAlbum).toHaveBeenCalledOnce();
  });

  it("shows an error and retries", () => {
    const onRetry = vi.fn();
    render(<AlbumsPage error="仓库暂时不可用" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("仓库暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
