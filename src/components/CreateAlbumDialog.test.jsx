import { fireEvent, render, screen } from "@testing-library/react";
import CreateAlbumDialog from "./CreateAlbumDialog";

const defaultProps = {
  open: true,
  name: "旅行",
  description: "",
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn(),
};

describe("CreateAlbumDialog", () => {
  beforeEach(() => {
    Object.values(defaultProps).forEach((value) => {
      if (typeof value === "function") value.mockClear();
    });
  });

  it("renders only while open and reports controlled field changes", () => {
    const { rerender } = render(<CreateAlbumDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<CreateAlbumDialog {...defaultProps} />);
    expect(screen.getByRole("dialog", { name: "创建新相册" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("相册名称"), {
      target: { value: "家庭影集" },
    });
    fireEvent.change(screen.getByLabelText("描述 可选"), {
      target: { value: "共同回忆" },
    });

    expect(defaultProps.onNameChange).toHaveBeenCalledWith("家庭影集");
    expect(defaultProps.onDescriptionChange).toHaveBeenCalledWith("共同回忆");
  });

  it("submits once when the name is valid", () => {
    render(<CreateAlbumDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "创建相册" }));
    expect(defaultProps.onSubmit).toHaveBeenCalledOnce();
  });

  it("blocks repeated submission and closing while busy", () => {
    render(<CreateAlbumDialog {...defaultProps} busy />);

    const submitButton = screen.getByRole("button", { name: "正在创建…" });
    const form = submitButton.closest("form");
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭创建相册对话框" })).toBeDisabled();

    fireEvent.submit(form);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("announces creation errors", () => {
    render(<CreateAlbumDialog {...defaultProps} error="相册名称已经存在" />);
    expect(screen.getByRole("alert")).toHaveTextContent("相册名称已经存在");
  });
});
