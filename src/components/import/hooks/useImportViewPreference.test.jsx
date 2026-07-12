import { act, renderHook } from "@testing-library/react";

import {
  IMPORT_VIEW_STORAGE_KEY,
  readImportViewPreference,
  useImportViewPreference,
} from "./useImportViewPreference";

describe("import view preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates the removed icons mode to masonry and writes it back", () => {
    localStorage.setItem(IMPORT_VIEW_STORAGE_KEY, "icons");

    expect(readImportViewPreference()).toBe("masonry");
    expect(localStorage.getItem(IMPORT_VIEW_STORAGE_KEY)).toBe("masonry");
  });

  it.each(["masonry", "list", "gallery"])(
    "restores and persists the supported %s view",
    (mode) => {
      localStorage.setItem(IMPORT_VIEW_STORAGE_KEY, mode);
      const { result } = renderHook(() => useImportViewPreference());

      expect(result.current[0]).toBe(mode);
      act(() => result.current[1](mode));
      expect(localStorage.getItem(IMPORT_VIEW_STORAGE_KEY)).toBe(mode);
    },
  );

  it("normalizes unsupported changes before persisting them", () => {
    const { result } = renderHook(() => useImportViewPreference());

    act(() => result.current[1]("icons"));

    expect(result.current[0]).toBe("masonry");
    expect(localStorage.getItem(IMPORT_VIEW_STORAGE_KEY)).toBe("masonry");
  });
});
