import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAlbum, getAlbums } from "../../../services/albumService";
import {
  detectCards,
  importPhotos,
  listenToImportProgress,
  scanCard,
} from "../../../services/importService";
import { selectDirectory } from "../../../services/workspaceService";
import useImportWizardData, {
  DEFAULT_IMPORT_ALBUM_NAME,
} from "./useImportWizardData";
import {
  createImportDraft,
  findImportDraft,
  saveImportDraft,
} from "./importDraftStorage";

vi.mock("../../../services/albumService", () => ({
  createAlbum: vi.fn(),
  getAlbums: vi.fn(),
}));

vi.mock("../../../services/importService", () => ({
  detectCards: vi.fn(),
  importPhotos: vi.fn(),
  listenToImportProgress: vi.fn(),
  scanCard: vi.fn(),
}));

vi.mock("../../../services/workspaceService", () => ({
  selectDirectory: vi.fn(),
}));

const freshPhoto = {
  absolutePath: "D:/DCIM/IMG_0001.JPG",
  relativePath: "IMG_0001.JPG",
  alreadyImported: false,
};

const importedPhoto = {
  absolutePath: "D:/DCIM/IMG_0002.JPG",
  relativePath: "IMG_0002.JPG",
  alreadyImported: true,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("useImportWizardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    detectCards.mockResolvedValue([]);
    getAlbums.mockResolvedValue([]);
    scanCard.mockResolvedValue([]);
    importPhotos.mockResolvedValue(0);
    listenToImportProgress.mockResolvedValue(vi.fn());
    selectDirectory.mockResolvedValue(null);
  });

  it("initializes cards and albums, scans the first card, and excludes duplicates", async () => {
    detectCards.mockResolvedValue([{ path: "D:/DCIM", label: "Camera" }]);
    getAlbums.mockResolvedValue([{ id: "album-1", name: "Trips" }]);
    scanCard.mockResolvedValue([freshPhoto, importedPhoto]);

    const { result } = renderHook(() => useImportWizardData());

    await waitFor(() => expect(result.current.photos).toHaveLength(2));

    expect(detectCards).toHaveBeenCalledTimes(1);
    expect(getAlbums).toHaveBeenCalledTimes(1);
    expect(scanCard).toHaveBeenCalledWith({ path: "D:/DCIM" });
    expect(result.current.sourcePath).toBe("D:/DCIM");
    expect(result.current.albums).toEqual([{ id: "album-1", name: "Trips" }]);
    expect(result.current.importedCount).toBe(1);
    expect(result.current.selectedPaths).toEqual([freshPhoto.absolutePath]);

    act(() => {
      result.current.setSelectedPaths([
        freshPhoto.absolutePath,
        importedPhoto.absolutePath,
        freshPhoto.absolutePath,
      ]);
      result.current.setPhotoAlbums({
        [freshPhoto.absolutePath]: "Trips",
        [importedPhoto.absolutePath]: "Should never import",
      });
    });

    expect(result.current.selectedImportPaths).toEqual([freshPhoto.absolutePath]);
    expect(result.current.photoAlbums).toEqual({
      [freshPhoto.absolutePath]: "Trips",
    });
  });

  it("ignores a stale scan response after the user chooses another source", async () => {
    const firstScan = deferred();
    const secondScan = deferred();
    scanCard.mockImplementation(({ path }) => (
      path === "A:/" ? firstScan.promise : secondScan.promise
    ));
    const { result } = renderHook(() => useImportWizardData());
    await waitFor(() => expect(result.current.detectingCards).toBe(false));

    let firstRequest;
    let secondRequest;
    act(() => {
      firstRequest = result.current.selectSource("A:/");
      secondRequest = result.current.selectSource("B:/");
    });

    const latestPhoto = { ...freshPhoto, absolutePath: "B:/latest.jpg" };
    await act(async () => {
      secondScan.resolve([latestPhoto]);
      await secondRequest;
    });
    expect(result.current.photos).toEqual([latestPhoto]);
    expect(result.current.sourcePath).toBe("B:/");

    await act(async () => {
      firstScan.resolve([{ ...freshPhoto, absolutePath: "A:/stale.jpg" }]);
      await firstRequest;
    });

    expect(result.current.photos).toEqual([latestPhoto]);
    expect(result.current.selectedPaths).toEqual([latestPhoto.absolutePath]);
    expect(result.current.scanning).toBe(false);
  });

  it("cleans up a progress listener that resolves after unmount", async () => {
    const pendingListener = deferred();
    const unlisten = vi.fn();
    listenToImportProgress.mockReturnValue(pendingListener.promise);

    const { unmount } = renderHook(() => useImportWizardData());
    expect(listenToImportProgress).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      pendingListener.resolve(unlisten);
      await pendingListener.promise;
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("submits snake_case photo DTOs, preserves import options, and attaches GPS", async () => {
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([freshPhoto, importedPhoto]);
    importPhotos.mockResolvedValue(1);
    const confirmAction = vi.fn(() => true);
    const notify = vi.fn();
    const onImportComplete = vi.fn();
    const onClose = vi.fn();
    const geolocation = {
      getCurrentPosition: vi.fn((success) => success({
        coords: { latitude: 31.2304, longitude: 121.4737 },
      })),
    };
    const { result } = renderHook(() => useImportWizardData({
      confirmAction,
      geolocation,
      notify,
      onClose,
      onImportComplete,
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(2));

    act(() => {
      result.current.setSelectedPaths([
        freshPhoto.absolutePath,
        importedPhoto.absolutePath,
      ]);
      result.current.setPhotoAlbums({
        [freshPhoto.absolutePath]: "Shanghai",
        [importedPhoto.absolutePath]: "Forbidden",
      });
      result.current.setBackupPath("  E:/Photo Backup  ");
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.startImport();
    });

    expect(outcome).toEqual({ status: "complete", count: 1 });
    expect(importPhotos).toHaveBeenCalledWith({
      imports: [{
        absolute_path: freshPhoto.absolutePath,
        album_name: "Shanghai",
      }],
      backupPath: "E:/Photo Backup",
      currentLocation: { latitude: 31.2304, longitude: 121.4737 },
    });
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(onImportComplete).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("1"));
    expect(findImportDraft(localStorage, {
      scope: "default",
      photos: [freshPhoto, importedPhoto],
    })).toBeNull();
  });

  it("restores a saved coloring draft and filters photos completed before interruption", async () => {
    const originalPhotos = [
      { ...freshPhoto, size: 100 },
      {
        absolutePath: "D:/DCIM/IMG_0003.JPG",
        relativePath: "IMG_0003.JPG",
        size: 300,
        alreadyImported: false,
      },
    ];
    const draft = createImportDraft({
      scope: "workspace-a",
      photos: originalPhotos,
      selectedPaths: originalPhotos.map((photo) => photo.absolutePath),
      photoAlbums: { [originalPhotos[1].absolutePath]: "旅行" },
    });
    saveImportDraft(localStorage, draft);

    const reinsertedPhotos = [
      { ...originalPhotos[0], absolutePath: "F:/DCIM/IMG_0001.JPG", alreadyImported: true },
      { ...originalPhotos[1], absolutePath: "F:/DCIM/IMG_0003.JPG" },
    ];
    detectCards.mockResolvedValue([{ path: "F:/DCIM" }]);
    scanCard.mockResolvedValue(reinsertedPhotos);
    const confirmAction = vi.fn(() => true);

    const { result } = renderHook(() => useImportWizardData({
      confirmAction,
      draftScope: "workspace-a",
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(2));

    expect(confirmAction).toHaveBeenCalledWith(
      expect.stringContaining("上次未完成"),
      expect.objectContaining({ confirmText: "恢复涂色" }),
    );
    expect(result.current.selectedPaths).toEqual([reinsertedPhotos[1].absolutePath]);
    expect(result.current.photoAlbums).toEqual({
      [reinsertedPhotos[1].absolutePath]: "旅行",
    });
  });

  it("lets the user discard a saved coloring draft and start over", async () => {
    const resumablePhoto = { ...freshPhoto, size: 100 };
    saveImportDraft(localStorage, createImportDraft({
      scope: "workspace-a",
      photos: [resumablePhoto],
      selectedPaths: [resumablePhoto.absolutePath],
      photoAlbums: { [resumablePhoto.absolutePath]: "旅行" },
    }));
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([resumablePhoto]);

    const { result } = renderHook(() => useImportWizardData({
      confirmAction: vi.fn(() => false),
      draftScope: "workspace-a",
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    expect(result.current.selectedPaths).toEqual([resumablePhoto.absolutePath]);
    expect(result.current.photoAlbums).toEqual({});
    expect(findImportDraft(localStorage, {
      scope: "workspace-a",
      photos: [resumablePhoto],
    })).toBeNull();
  });

  it("keeps the coloring draft when copying is interrupted", async () => {
    const resumablePhoto = { ...freshPhoto, size: 100 };
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([resumablePhoto]);
    importPhotos.mockRejectedValue(new Error("device disconnected"));
    const notify = vi.fn();

    const { result } = renderHook(() => useImportWizardData({
      confirmAction: vi.fn(() => true),
      draftScope: "workspace-a",
      initialAttachCurrentLocation: false,
      notify,
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    act(() => result.current.setPhotoAlbums({
      [resumablePhoto.absolutePath]: "旅行",
    }));

    let importRequest;
    act(() => {
      importRequest = result.current.startImport();
    });
    await waitFor(() => expect(importPhotos).toHaveBeenCalledTimes(1));
    const outcome = await importRequest;

    expect(outcome.status).toBe("error");
    expect(findImportDraft(localStorage, {
      scope: "workspace-a",
      photos: [resumablePhoto],
    })?.selections).toEqual([{
      photoKey: expect.any(String),
      albumName: "旅行",
    }]);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("导入失败"));
  });

  it("treats a short backend result as incomplete and retains the draft", async () => {
    const resumablePhoto = { ...freshPhoto, size: 100 };
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([resumablePhoto]);
    importPhotos.mockResolvedValue(0);

    const { result } = renderHook(() => useImportWizardData({
      confirmAction: vi.fn(() => true),
      draftScope: "workspace-a",
      initialAttachCurrentLocation: false,
      notify: vi.fn(),
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    let importRequest;
    act(() => {
      importRequest = result.current.startImport();
    });
    await waitFor(() => expect(importPhotos).toHaveBeenCalledTimes(1));
    const outcome = await importRequest;

    expect(outcome.status).toBe("error");
    expect(outcome.error.message).toContain("实际完成 0 张");
    expect(findImportDraft(localStorage, {
      scope: "workspace-a",
      photos: [resumablePhoto],
    })).not.toBeNull();
  });

  it("can continue without GPS after location lookup fails", async () => {
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([freshPhoto]);
    importPhotos.mockResolvedValue(1);
    const confirmAction = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    const geolocation = {
      getCurrentPosition: vi.fn((_success, failure) => failure({ code: 2 })),
    };
    const { result } = renderHook(() => useImportWizardData({
      confirmAction,
      geolocation,
      notify: vi.fn(),
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    await act(async () => {
      await result.current.startImport();
    });

    expect(confirmAction).toHaveBeenCalledTimes(2);
    expect(confirmAction.mock.calls[0][0]).toContain("GPS");
    expect(importPhotos).toHaveBeenCalledWith(expect.objectContaining({
      currentLocation: null,
      imports: [{
        absolute_path: freshPhoto.absolutePath,
        album_name: DEFAULT_IMPORT_ALBUM_NAME,
      }],
    }));
    expect(result.current.locationStatus).toBe("error");
  });

  it("locks the GPS preflight and cancels stale work after unmount", async () => {
    detectCards.mockResolvedValue([{ path: "D:/DCIM" }]);
    scanCard.mockResolvedValue([freshPhoto]);
    const locationRequest = deferred();
    let resolveLocation;
    const geolocation = {
      getCurrentPosition: vi.fn((success) => {
        resolveLocation = success;
        return locationRequest.promise;
      }),
    };
    const confirmAction = vi.fn(() => true);
    const notify = vi.fn();
    const { result, unmount } = renderHook(() => useImportWizardData({
      confirmAction,
      geolocation,
      notify,
    }));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    let firstRequest;
    await act(async () => {
      firstRequest = result.current.startImport();
      await Promise.resolve();
    });
    expect(result.current.preparingImport).toBe(true);

    let secondOutcome;
    await act(async () => {
      secondOutcome = await result.current.startImport();
    });
    expect(secondOutcome).toEqual({ status: "busy" });

    unmount();
    let firstOutcome;
    await act(async () => {
      resolveLocation({
        coords: { latitude: 31.2304, longitude: 121.4737 },
      });
      firstOutcome = await firstRequest;
    });

    expect(firstOutcome).toEqual({ status: "cancelled" });
    expect(confirmAction).not.toHaveBeenCalled();
    expect(importPhotos).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refreshes the album list after creating an album", async () => {
    const createdAlbum = { id: "album-2", name: "New Album" };
    getAlbums
      .mockResolvedValueOnce([{ id: "album-1", name: "Old Album" }])
      .mockResolvedValueOnce([
        { id: "album-1", name: "Old Album" },
        createdAlbum,
      ]);
    createAlbum.mockResolvedValue(createdAlbum);
    const { result } = renderHook(() => useImportWizardData());
    await waitFor(() => expect(result.current.albums).toHaveLength(1));

    await act(async () => {
      await result.current.createAlbumAndReload({
        name: "New Album",
        description: null,
      });
    });

    expect(createAlbum).toHaveBeenCalledWith({
      name: "New Album",
      description: null,
    });
    expect(getAlbums).toHaveBeenCalledTimes(2);
    expect(result.current.albums).toContainEqual(createdAlbum);
  });
});
