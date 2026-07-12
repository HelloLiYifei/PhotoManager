import { act, renderHook } from "@testing-library/react";
import {
  PHOTO_VIEW_STORAGE_KEY,
  readPhotoViewPreference,
  usePhotoViewPreference,
} from "./usePhotoViewPreference";

describe("photo view preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates the legacy icons mode to masonry immediately", () => {
    localStorage.setItem(PHOTO_VIEW_STORAGE_KEY, "icons");

    expect(readPhotoViewPreference()).toBe("masonry");
    expect(localStorage.getItem(PHOTO_VIEW_STORAGE_KEY)).toBe("masonry");
  });

  it.each(["masonry", "list", "gallery"])(
    "restores the supported %s mode",
    (mode) => {
      localStorage.setItem(PHOTO_VIEW_STORAGE_KEY, mode);

      const { result } = renderHook(() => usePhotoViewPreference());

      expect(result.current[0]).toBe(mode);
      expect(localStorage.getItem(PHOTO_VIEW_STORAGE_KEY)).toBe(mode);
    },
  );

  it("persists changes and normalizes unsupported modes", () => {
    const { result } = renderHook(() => usePhotoViewPreference());

    act(() => result.current[1]("gallery"));
    expect(result.current[0]).toBe("gallery");
    expect(localStorage.getItem(PHOTO_VIEW_STORAGE_KEY)).toBe("gallery");

    act(() => result.current[1]("icons"));
    expect(result.current[0]).toBe("masonry");
    expect(localStorage.getItem(PHOTO_VIEW_STORAGE_KEY)).toBe("masonry");
  });
});
