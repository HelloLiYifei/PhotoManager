import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useTimelineActions from "./useTimelineActions";

const serviceMocks = vi.hoisted(() => ({
  addTagToPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  emptyTrashToRecycleBin: vi.fn(),
  exportPhotos: vi.fn(),
  movePhotosToAlbum: vi.fn(),
  permanentlyDeletePhotos: vi.fn(),
  restorePhotos: vi.fn(),
  selectDirectory: vi.fn(),
  toggleFavorite: vi.fn(),
  updateRating: vi.fn(),
}));

vi.mock("../../../services/albumService", () => ({
  movePhotosToAlbum: serviceMocks.movePhotosToAlbum,
}));

vi.mock("../../../services/photoService", () => ({
  addTagToPhoto: serviceMocks.addTagToPhoto,
  deletePhoto: serviceMocks.deletePhoto,
  emptyTrashToRecycleBin: serviceMocks.emptyTrashToRecycleBin,
  exportPhotos: serviceMocks.exportPhotos,
  permanentlyDeletePhotos: serviceMocks.permanentlyDeletePhotos,
  restorePhotos: serviceMocks.restorePhotos,
  toggleFavorite: serviceMocks.toggleFavorite,
  updateRating: serviceMocks.updateRating,
}));

vi.mock("../../../services/workspaceService", () => ({
  selectDirectory: serviceMocks.selectDirectory,
}));

function createProps(overrides = {}) {
  return {
    currentView: "album",
    photos: [
      { id: "p1", isFavorite: false },
      { id: "p2", isFavorite: true },
    ],
    selectedIds: ["p1", "p2"],
    primaryPhoto: { id: "p2", rating: 2 },
    clearSelection: vi.fn(),
    reloadPhotos: vi.fn().mockResolvedValue([]),
    reloadAllTags: vi.fn().mockResolvedValue([]),
    reloadPrimaryTags: vi.fn().mockResolvedValue([]),
    onPhotosUpdated: vi.fn(),
    ...overrides,
  };
}

describe("useTimelineActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(serviceMocks)) mock.mockResolvedValue(undefined);
    serviceMocks.selectDirectory.mockResolvedValue("D:/Exports");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("  旅行  ");
  });

  it("keeps favorite, rating, tagging, move, export and soft-delete operations", async () => {
    const props = createProps();
    const { result } = renderHook(() => useTimelineActions(props));

    await act(() => result.current.favoriteSelected());
    expect(serviceMocks.toggleFavorite).toHaveBeenNthCalledWith(1, {
      id: "p1",
      isFavorite: true,
    });
    expect(serviceMocks.toggleFavorite).toHaveBeenNthCalledWith(2, {
      id: "p2",
      isFavorite: true,
    });

    await act(() => result.current.ratePhoto(5));
    expect(serviceMocks.updateRating).toHaveBeenCalledWith({ id: "p2", rating: 5 });

    await act(() => result.current.tagSelected());
    expect(serviceMocks.addTagToPhoto).toHaveBeenCalledWith({
      photoId: "p1",
      tagName: "旅行",
    });
    expect(props.reloadPrimaryTags).toHaveBeenCalledWith("p2");

    await act(() => result.current.moveSelected("album-2"));
    expect(serviceMocks.movePhotosToAlbum).toHaveBeenCalledWith({
      photoIds: ["p1", "p2"],
      targetAlbumId: "album-2",
    });

    await act(() => result.current.exportSelected());
    expect(serviceMocks.exportPhotos).toHaveBeenCalledWith({
      photoIds: ["p1", "p2"],
      destDir: "D:/Exports",
    });

    await act(() => result.current.deleteSelected());
    expect(serviceMocks.deletePhoto).toHaveBeenCalledTimes(2);
    expect(serviceMocks.deletePhoto).toHaveBeenCalledWith({ id: "p1", isDeleted: true });
    expect(props.clearSelection).toHaveBeenCalledTimes(2);
  });

  it("keeps restore, permanent-delete and empty-trash flows", async () => {
    const props = createProps({ currentView: "trash" });
    const { result } = renderHook(() => useTimelineActions(props));

    await act(() => result.current.restoreSelected());
    expect(serviceMocks.restorePhotos).toHaveBeenCalledWith({ ids: ["p1", "p2"] });

    await act(() => result.current.deleteSelected());
    expect(window.confirm).toHaveBeenCalled();
    expect(serviceMocks.permanentlyDeletePhotos).toHaveBeenCalledWith({
      ids: ["p1", "p2"],
    });

    await act(() => result.current.emptyTrash());
    expect(serviceMocks.emptyTrashToRecycleBin).toHaveBeenCalledOnce();
    expect(props.reloadPhotos).toHaveBeenCalledTimes(3);
    expect(props.onPhotosUpdated).toHaveBeenCalledTimes(3);
  });
});
