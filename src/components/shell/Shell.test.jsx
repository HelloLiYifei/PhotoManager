import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AppShell from "./AppShell";
import PageHeader from "./PageHeader";
import Sidebar from "./Sidebar";

const workspace = {
  name: "旅行图库",
  path: "D:/Photos/Travel",
};

const albums = [
  { id: 1, name: "杭州之旅", photoCount: 12 },
  { id: 2, name: "家庭", photoCount: 0 },
];

describe("application shell", () => {
  it("renders an overlay scrim that requests closing", () => {
    const onRequestSidebarClose = vi.fn();

    render(
      <AppShell
        sidebar={<aside>导航</aside>}
        header={<header>标题</header>}
        sidebarMode="overlay"
        onRequestSidebarClose={onRequestSidebarClose}
      >
        页面内容
      </AppShell>,
    );

    expect(screen.getByText("页面内容").closest("main")).toHaveAttribute(
      "aria-label",
      "照片内容",
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏" }));
    expect(onRequestSidebarClose).toHaveBeenCalledOnce();
  });

  it("exposes navigation, album, import, and workspace actions", () => {
    const onNavigate = vi.fn();
    const onOpenAlbum = vi.fn();
    const onImport = vi.fn();
    const onSwitchWorkspace = vi.fn();
    const onToggleMode = vi.fn();

    render(
      <Sidebar
        workspace={workspace}
        currentView="album"
        activeAlbumId={1}
        albums={albums}
        detectedCard={{ label: "EOS_CARD" }}
        mode="overlay"
        onNavigate={onNavigate}
        onOpenAlbum={onOpenAlbum}
        onImport={onImport}
        onSwitchWorkspace={onSwitchWorkspace}
        onToggleMode={onToggleMode}
      />,
    );

    expect(screen.getByRole("button", { name: /^杭州之旅/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "我的喜欢" }));
    fireEvent.click(screen.getByRole("button", { name: /^家庭/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "检测到存储卡 EOS_CARD，点击导入",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "切换工作区" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏" }));

    expect(onNavigate).toHaveBeenCalledWith("favorites");
    expect(onOpenAlbum).toHaveBeenCalledWith(albums[1]);
    expect(onImport).toHaveBeenCalledOnce();
    expect(onSwitchWorkspace).toHaveBeenCalledOnce();
    expect(onToggleMode).toHaveBeenCalledWith("collapsed");
  });

  it("describes the page and exposes the controlled sidebar toggle", () => {
    const onToggleSidebar = vi.fn();

    render(
      <PageHeader
        title="相册"
        description="浏览全部相册"
        workspaceName="旅行图库"
        sidebarMode="collapsed"
        onToggleSidebar={onToggleSidebar}
        actions={<button type="button">新建相册</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "相册" })).toBeInTheDocument();
    expect(screen.getByText("浏览全部相册")).toBeInTheDocument();
    expect(screen.getByText("旅行图库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });
});
