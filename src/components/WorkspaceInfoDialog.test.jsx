import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import WorkspaceInfoDialog from "./WorkspaceInfoDialog";

describe("WorkspaceInfoDialog", () => {
  it("shows the workspace name, path, and physical-directory storage format", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceInfoDialog
        open
        onClose={onClose}
        workspace={{ name: "摄影图库", path: "D:/Photos" }}
      />,
    );

    expect(screen.getByRole("dialog", { name: "工作区信息" })).toBeInTheDocument();
    expect(screen.getByText("摄影图库")).toBeInTheDocument();
    expect(screen.getByText("D:/Photos")).toBeInTheDocument();
    expect(screen.getByText("物理目录直接映射")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when closed", () => {
    render(
      <WorkspaceInfoDialog
        open={false}
        onClose={vi.fn()}
        workspace={{ name: "摄影图库", path: "D:/Photos" }}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
