import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button, Dialog, Drawer, EmptyState, Field, Select, Spinner } from ".";

describe("shared UI primitives", () => {
  it("renders buttons, fields, status and empty states", () => {
    render(
      <>
        <Button variant="primary">保存</Button>
        <Field label="名称" htmlFor="name" hint="必填">
          <input id="name" />
        </Field>
        <Spinner label="加载照片" />
        <EmptyState title="暂无照片" description="请先导入照片" />
      </>,
    );

    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "加载照片" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "暂无照片" })).toBeInTheDocument();
  });

  it("supports keyboard navigation in the themed select menu", () => {
    const onChange = vi.fn();
    render(
      <Select
        value="one"
        onChange={onChange}
        aria-label="排序方式"
        options={[
          { value: "one", label: "名称" },
          { value: "two", label: "日期" },
        ]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "排序方式" });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("two");
  });

  it("closes dialogs with Escape and restores focus", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">入口</button>
        <Dialog open={false} title="信息" onClose={onClose}>内容</Dialog>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "入口" });
    trigger.focus();

    rerender(
      <>
        <button type="button">入口</button>
        <Dialog open title="信息" onClose={onClose}><button type="button">操作</button></Dialog>
      </>,
    );
    expect(screen.getByRole("dialog", { name: "信息" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <>
        <button type="button">入口</button>
        <Dialog open={false} title="信息" onClose={onClose}>内容</Dialog>
      </>,
    );
    expect(screen.getByRole("button", { name: "入口" })).toHaveFocus();
  });

  it("exposes drawers as modal dialogs", () => {
    const onClose = vi.fn();
    render(<Drawer open title="照片信息" onClose={onClose}>详情</Drawer>);
    expect(screen.getByRole("dialog", { name: "照片信息" })).toHaveAttribute("aria-modal", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "关闭抽屉" })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("absorbs Escape while an overlay is locked", () => {
    const onClose = vi.fn();
    const outerEscape = vi.fn();
    window.addEventListener("keydown", outerEscape);
    render(
      <Drawer open title="处理中" onClose={onClose} closeDisabled>
        正在保存
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(outerEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", outerEscape);
  });
});
