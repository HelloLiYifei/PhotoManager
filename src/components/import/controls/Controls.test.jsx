import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AlbumBrushPanel from "./AlbumBrushPanel";
import ConfigurationPanel from "./ConfigurationPanel";
import ImportConfirmBar from "./ImportConfirmBar";
import ImportOptions from "./ImportOptions";
import ImportPreviewToolbar from "./ImportPreviewToolbar";
import ImportProgressOverlay from "./ImportProgressOverlay";
import SourceConfig from "./SourceConfig";

describe("import controls", () => {
  it("exposes source path, browse, detected-card and scan-state actions", () => {
    const onSourcePathChange = vi.fn();
    const onScanSource = vi.fn();
    const onBrowse = vi.fn();
    const onSelectCard = vi.fn();
    const onDetectCards = vi.fn();

    const { rerender } = render(
      <SourceConfig
        sourcePath="E:/DCIM"
        cards={[{ path: "E:/", driveLetter: "E", label: "相机卡" }]}
        scannedCount={18}
        onSourcePathChange={onSourcePathChange}
        onScanSource={onScanSource}
        onBrowse={onBrowse}
        onSelectCard={onSelectCard}
        onDetectCards={onDetectCards}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "来源路径" }), {
      target: { value: "F:/Photos" },
    });
    expect(onScanSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "扫描来源路径" }));
    fireEvent.click(screen.getByRole("button", { name: "浏览" }));
    fireEvent.click(screen.getByRole("button", { name: "检测设备" }));
    fireEvent.click(screen.getByRole("button", { name: /相机卡/ }));

    expect(onSourcePathChange).toHaveBeenCalledWith("F:/Photos");
    expect(onScanSource).toHaveBeenCalledWith("E:/DCIM");
    expect(onBrowse).toHaveBeenCalledOnce();
    expect(onDetectCards).toHaveBeenCalledOnce();
    expect(onSelectCard).toHaveBeenCalledWith(
      "E:/",
      expect.objectContaining({ label: "相机卡" }),
    );
    expect(screen.getByText("发现 18 张照片")).toBeInTheDocument();

    rerender(<SourceConfig sourcePath="E:/DCIM" scanning />);
    expect(screen.getByText("正在扫描照片")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "来源路径" })).toBeDisabled();
  });

  it("controls the active album brush and album creation entry", () => {
    const onBrushChange = vi.fn();
    const onCreateAlbum = vi.fn();

    render(
      <AlbumBrushPanel
        albums={[
          { id: "default", name: "默认相册", color: "#64748b" },
          { id: 2, name: "旅行" },
        ]}
        activeAlbum="默认相册"
        getAlbumColor={(name) => (name === "旅行" ? "#f97316" : "#64748b")}
        onBrushChange={onBrushChange}
        onCreateAlbum={onCreateAlbum}
      />,
    );

    expect(screen.getByRole("option", { name: /默认相册/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: "旅行" }));
    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    expect(onBrushChange).toHaveBeenCalledWith(
      "旅行",
      expect.objectContaining({ id: 2 }),
    );
    expect(onCreateAlbum).toHaveBeenCalledOnce();
  });

  it("controls GPS and backup options without exposing file renaming", () => {
    const onAttachCurrentLocationChange = vi.fn();
    const onRequestLocation = vi.fn();
    const onBackupPathChange = vi.fn();
    const onBrowseBackup = vi.fn();

    render(
      <ImportOptions
        attachCurrentLocation
        locationStatus="ready"
        currentLocation={{ latitude: 31.230416, longitude: 121.473701 }}
        backupPath="D:/Backup"
        onAttachCurrentLocationChange={onAttachCurrentLocationChange}
        onRequestLocation={onRequestLocation}
        onBackupPathChange={onBackupPathChange}
        onBrowseBackup={onBrowseBackup}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /补充当前位置/ }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    fireEvent.change(screen.getByRole("textbox", { name: /备份目录/ }), {
      target: { value: "C:/Copies" },
    });
    fireEvent.click(screen.getByRole("button", { name: "浏览" }));

    expect(screen.getByText("31.23042, 121.47370")).toBeInTheDocument();
    expect(onAttachCurrentLocationChange).toHaveBeenCalledWith(false);
    expect(onRequestLocation).toHaveBeenCalledOnce();
    expect(screen.queryByRole("combobox", { name: "重命名规则" })).not.toBeInTheDocument();
    expect(onBackupPathChange).toHaveBeenCalledWith("C:/Copies");
    expect(onBrowseBackup).toHaveBeenCalledOnce();
  });

  it("uses the shared three-view switcher and exposes preview filters", () => {
    const onViewModeChange = vi.fn();
    const onHideImportedChange = vi.fn();
    const onHideColoredChange = vi.fn();
    const onHideRawChange = vi.fn();

    render(
      <ImportPreviewToolbar
        visibleCount={9}
        totalCount={12}
        selectedCount={4}
        importedCount={3}
        rawCount={2}
        viewMode="masonry"
        onViewModeChange={onViewModeChange}
        onHideImportedChange={onHideImportedChange}
        onHideColoredChange={onHideColoredChange}
        onHideRawChange={onHideRawChange}
      />,
    );

    expect(screen.getAllByRole("button", { name: /视图$/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "图标视图" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
    fireEvent.click(screen.getByRole("button", { name: /隐藏已导入/ }));
    fireEvent.click(screen.getByRole("button", { name: /隐藏已染色/ }));
    fireEvent.click(screen.getByRole("button", { name: /隐藏 RAW/ }));

    expect(onViewModeChange).toHaveBeenCalledWith("list");
    expect(onHideImportedChange).toHaveBeenCalledWith(true);
    expect(onHideColoredChange).toHaveBeenCalledWith(true);
    expect(onHideRawChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("显示 9 / 12 张照片")).toBeInTheDocument();
  });

  it("keeps confirm shortcuts, progress and the responsive configuration entry controlled", () => {
    const onColorAll = vi.fn();
    const onClearColors = vi.fn();
    const onImport = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <>
        <ConfigurationPanel open={false} onOpen={onOpen} onClose={onClose}>
          <span>配置内容</span>
        </ConfigurationPanel>
        <ImportConfirmBar
          selectedCount={5}
          totalCount={8}
          importedCount={1}
          activeBrush="旅行"
          brushColor="#f97316"
          onColorAll={onColorAll}
          onClearColors={onClearColors}
          onImport={onImport}
        />
        <ImportProgressOverlay open copied={2} total={5} currentFile="IMG_0002.RAW" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "导入配置" }));
    fireEvent.click(screen.getByRole("button", { name: /全部染为“旅行”/ }));
    fireEvent.click(screen.getByRole("button", { name: "全部取消" }));
    fireEvent.click(screen.getByRole("button", { name: "开始导入 5 张" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onColorAll).toHaveBeenCalledOnce();
    expect(onClearColors).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledOnce();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("IMG_0002.RAW", { exact: false })).toBeInTheDocument();

    rerender(
      <ConfigurationPanel open onOpen={onOpen} onClose={onClose}>
        <span>配置内容</span>
      </ConfigurationPanel>,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭导入配置" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭导入配置面板" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
