import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import ViewSwitcher from "./ViewSwitcher";

describe("ViewSwitcher", () => {
  it("offers the shared three views and reports preference changes", () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="list" onChange={onChange} ariaLabel="预览模式" />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "图标视图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "列表视图" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "画廊视图" }));
    expect(onChange).toHaveBeenCalledWith("gallery");
  });
});
