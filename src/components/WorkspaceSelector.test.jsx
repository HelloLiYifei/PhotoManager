import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSelector from "./WorkspaceSelector";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaces,
  openWorkspace,
  selectDirectory,
} from "../services/workspaceService";

vi.mock("../services/workspaceService", () => ({
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
  selectDirectory: vi.fn(),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("WorkspaceSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaces.mockResolvedValue([]);
    selectDirectory.mockResolvedValue(null);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("sorts recent workspaces by last opened and prevents duplicate opens", async () => {
    const opening = deferred();
    const onSelectWorkspace = vi.fn();
    getWorkspaces.mockResolvedValue([
      { id: "old", name: "旧图库", path: "D:/Old", lastOpened: "2026-01-01" },
      { id: "new", name: "新图库", path: "D:/New", lastOpened: "2026-07-13" },
    ]);
    openWorkspace.mockReturnValue(opening.promise);

    render(<WorkspaceSelector onSelectWorkspace={onSelectWorkspace} />);

    const recentList = await screen.findByRole("list");
    const openButtons = within(recentList).getAllByRole("button", {
      name: /打开工作区/,
    });
    expect(openButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "打开工作区 新图库",
      "打开工作区 旧图库",
    ]);

    fireEvent.click(openButtons[0]);
    fireEvent.click(openButtons[0]);
    expect(openWorkspace).toHaveBeenCalledTimes(1);
    expect(openWorkspace).toHaveBeenCalledWith({ path: "D:/New" });

    opening.resolve({ id: "new", name: "新图库", path: "D:/New" });
    await waitFor(() => expect(onSelectWorkspace).toHaveBeenCalledTimes(1));
  });

  it("fills the folder name after browsing and creates a workspace", async () => {
    const onSelectWorkspace = vi.fn();
    const createdWorkspace = {
      id: "travel",
      name: "旅行",
      path: "E:\\图库\\旅行",
    };
    selectDirectory.mockResolvedValue("E:\\图库\\旅行");
    createWorkspace.mockResolvedValue(createdWorkspace);

    render(<WorkspaceSelector onSelectWorkspace={onSelectWorkspace} />);
    await screen.findByText("还没有最近工作区");

    fireEvent.click(screen.getByRole("button", { name: "选择目录" }));
    await waitFor(() => {
      expect(screen.getByLabelText("本地文件夹")).toHaveValue("E:\\图库\\旅行");
      expect(screen.getByLabelText("工作区名称")).toHaveValue("旅行");
    });

    fireEvent.click(screen.getByRole("button", { name: "创建并进入" }));
    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledWith({
        name: "旅行",
        path: "E:\\图库\\旅行",
      });
      expect(onSelectWorkspace).toHaveBeenCalledWith(createdWorkspace);
    });
  });

  it("opens a typed existing path and reports action errors in the page", async () => {
    const onSelectWorkspace = vi.fn();
    openWorkspace.mockRejectedValue(new Error("不是有效的工作区"));

    render(<WorkspaceSelector onSelectWorkspace={onSelectWorkspace} />);
    await screen.findByText("还没有最近工作区");

    fireEvent.change(screen.getByLabelText("本地文件夹"), {
      target: { value: "F:/Existing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "打开已有工作区" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("不是有效的工作区");
    expect(openWorkspace).toHaveBeenCalledWith({ path: "F:/Existing" });
    expect(onSelectWorkspace).not.toHaveBeenCalled();
  });

  it("confirms record-only removal, deletes it, and refreshes recent workspaces", async () => {
    const workspace = {
      id: "remove-me",
      name: "临时图库",
      path: "D:/Temporary",
      lastOpened: "2026-07-12",
    };
    getWorkspaces.mockResolvedValueOnce([workspace]).mockResolvedValueOnce([]);
    deleteWorkspace.mockResolvedValue(undefined);

    render(<WorkspaceSelector onSelectWorkspace={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "从记录中移除 临时图库" }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("磁盘上的照片文件不会被删除"),
    );
    await waitFor(() => expect(deleteWorkspace).toHaveBeenCalledWith({ id: "remove-me" }));
    expect(await screen.findByText("还没有最近工作区")).toBeInTheDocument();
    expect(getWorkspaces).toHaveBeenCalledTimes(2);
  });

  it("offers a retry for recent-list errors", async () => {
    getWorkspaces.mockRejectedValueOnce(new Error("读取记录失败")).mockResolvedValueOnce([]);

    render(<WorkspaceSelector onSelectWorkspace={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("读取记录失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("还没有最近工作区")).toBeInTheDocument();
    expect(getWorkspaces).toHaveBeenCalledTimes(2);
  });

  it("does not select a workspace when creation resolves after unmount", async () => {
    const creation = deferred();
    const onSelectWorkspace = vi.fn();
    createWorkspace.mockReturnValue(creation.promise);

    const { unmount } = render(
      <WorkspaceSelector onSelectWorkspace={onSelectWorkspace} />,
    );
    await screen.findByText("还没有最近工作区");
    fireEvent.change(screen.getByLabelText("本地文件夹"), {
      target: { value: "D:/Later" },
    });
    fireEvent.change(screen.getByLabelText("工作区名称"), {
      target: { value: "稍后" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建并进入" }));
    unmount();

    creation.resolve({ id: "later", name: "稍后", path: "D:/Later" });
    await creation.promise;
    expect(onSelectWorkspace).not.toHaveBeenCalled();
  });
});
