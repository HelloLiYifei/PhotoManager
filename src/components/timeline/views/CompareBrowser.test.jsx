import { fireEvent, render, screen } from "@testing-library/react";
import CompareBrowser from "./CompareBrowser";

vi.mock("../media", () => ({
  GalleryPreviewImage: ({ alt, id }) => (
    <img alt={alt} data-testid="compare-gallery-preview" data-photo-id={id} />
  ),
  ThumbnailImage: ({ alt }) => <img alt={alt} src="thumbnail.jpg" />,
}));

const photos = [
  { id: "photo-1", filename: "海边.jpg", fileType: "JPG", width: 4000, height: 3000 },
  { id: "photo-2", filename: "树林.raw", fileType: "RAW", width: 6000, height: 4000 },
];

describe("CompareBrowser", () => {
  it("opens a left-side detail view, navigates within the comparison album, and returns to the album", () => {
    render(<CompareBrowser photos={photos} lockedId="photo-1" />);

    expect(screen.getByRole("region", { name: "对比相册" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("gridcell", { name: "树林.raw" }));
    expect(screen.getByRole("region", { name: "对比照片详情" })).toBeInTheDocument();
    expect(screen.getByTestId("compare-gallery-preview")).toHaveAttribute("data-photo-id", "photo-2");

    const gallery = screen.getByLabelText("画廊照片预览");
    fireEvent.keyDown(gallery, { key: "ArrowLeft" });
    expect(screen.getByTestId("compare-gallery-preview")).toHaveAttribute("data-photo-id", "photo-1");

    const controls = screen.getByRole("button", { name: "下一张" })
      .closest(".pm-batch-action-bar-bar");
    expect(controls).toContainElement(screen.getByRole("button", { name: "返回相册" }));

    fireEvent.click(screen.getByRole("button", { name: "下一张" }));
    expect(screen.getByTestId("compare-gallery-preview")).toHaveAttribute("data-photo-id", "photo-2");

    fireEvent.click(screen.getByRole("button", { name: "返回相册" }));
    expect(screen.getByRole("region", { name: "对比相册" })).toBeInTheDocument();
  });
});
