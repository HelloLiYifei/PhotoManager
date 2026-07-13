import { act, renderHook } from "@testing-library/react";
import { useState } from "react";

import useAlbumBrush from "./useAlbumBrush";

const fresh = { absolutePath: "D:/fresh.jpg", alreadyImported: false };
const duplicate = { absolutePath: "D:/duplicate.jpg", alreadyImported: true };

function useHarness() {
  const [selectedPaths, setSelectedPaths] = useState([fresh.absolutePath]);
  const [photoAlbums, setPhotoAlbums] = useState({});
  const brush = useAlbumBrush({
    photos: [fresh, duplicate],
    selectedPaths,
    setSelectedPaths,
    photoAlbums,
    setPhotoAlbums,
    alreadyImportedPaths: new Set([duplicate.absolutePath]),
  });
  return { selectedPaths, photoAlbums, ...brush };
}

describe("useAlbumBrush", () => {
  it("keeps duplicate photos protected and preserves default-brush toggle semantics", () => {
    const { result } = renderHook(useHarness);

    act(() => result.current.setBrushAlbum("默认相册"));
    act(() => {
      expect(result.current.applyBrushColor(duplicate.absolutePath)).toBe(false);
      expect(result.current.applyBrushColor(fresh.absolutePath)).toBe(true);
    });
    expect(result.current.selectedPaths).toEqual([]);

    act(() => result.current.applyBrushColor(fresh.absolutePath));
    expect(result.current.selectedPaths).toEqual([fresh.absolutePath]);
    expect(result.current.photoAlbums).toEqual({});
  });

  it("colors all fresh photos for the active album and clears them", () => {
    const { result } = renderHook(useHarness);
    act(() => result.current.setBrushAlbum("旅行"));
    act(() => result.current.colorAll());

    expect(result.current.selectedPaths).toEqual([fresh.absolutePath]);
    expect(result.current.photoAlbums).toEqual({ [fresh.absolutePath]: "旅行" });

    act(() => result.current.clearColors());
    expect(result.current.selectedPaths).toEqual([]);
    expect(result.current.photoAlbums).toEqual({});
  });

  it("sets and clears an explicit detail-view album while protecting duplicates", () => {
    const { result } = renderHook(useHarness);

    act(() => {
      expect(result.current.setPhotoAlbum(fresh.absolutePath, "旅行")).toBe(true);
    });
    expect(result.current.selectedPaths).toEqual([fresh.absolutePath]);
    expect(result.current.photoAlbums).toEqual({ [fresh.absolutePath]: "旅行" });

    act(() => result.current.setPhotoAlbum(fresh.absolutePath, "默认相册"));
    expect(result.current.selectedPaths).toEqual([fresh.absolutePath]);
    expect(result.current.photoAlbums).toEqual({});

    act(() => result.current.setPhotoAlbum(fresh.absolutePath, null));
    expect(result.current.selectedPaths).toEqual([]);
    expect(result.current.photoAlbums).toEqual({});

    act(() => {
      expect(result.current.setPhotoAlbum(duplicate.absolutePath, "旅行")).toBe(false);
    });
    expect(result.current.selectedPaths).toEqual([]);
  });
});
