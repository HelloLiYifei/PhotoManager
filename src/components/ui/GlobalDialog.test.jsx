import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlobalDialogProvider, useGlobalDialog } from ".";

function DialogHarness() {
  const dialog = useGlobalDialog();
  const [result, setResult] = useState("等待操作");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          await dialog.alert("照片已经安全导入。", {
            title: "导入完成",
            tone: "success",
          });
          setResult("提示已确认");
        }}
      >
        打开提示
      </button>
      <button
        type="button"
        onClick={async () => {
          const accepted = await dialog.confirm("删除后无法恢复。", {
            title: "永久删除",
            tone: "danger",
          });
          setResult(accepted ? "已确认" : "已取消");
        }}
      >
        打开确认
      </button>
      <button
        type="button"
        onClick={async () => {
          const value = await dialog.prompt("输入一个标签。", {
            title: "添加标签",
            inputLabel: "标签名称",
          });
          setResult(value ?? "未输入");
        }}
      >
        打开输入
      </button>
      <output>{result}</output>
    </>
  );
}

describe("global dialog", () => {
  it("renders project-styled alerts and resolves them", async () => {
    render(
      <GlobalDialogProvider>
        <DialogHarness />
      </GlobalDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开提示" }));
    const dialog = screen.getByRole("alertdialog", { name: "导入完成" });
    expect(dialog).toHaveAttribute("data-tone", "success");
    expect(dialog).toHaveTextContent("照片已经安全导入。");

    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(await screen.findByText("提示已确认")).toBeInTheDocument();
  });

  it("supports cancelling confirmations and submitting text", async () => {
    render(
      <GlobalDialogProvider>
        <DialogHarness />
      </GlobalDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开确认" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(await screen.findByText("已取消")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开输入" }));
    fireEvent.change(screen.getByRole("textbox", { name: "标签名称" }), {
      target: { value: "旅行" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(await screen.findByText("旅行")).toBeInTheDocument();
  });
});
