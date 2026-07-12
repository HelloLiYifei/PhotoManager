import { act, renderHook } from "@testing-library/react";
import { usePhotoSelection } from "./usePhotoSelection";

const photos = [
  { id: 1, filename: "one.jpg" },
  { id: 2, filename: "two.jpg" },
  { id: 3, filename: "three.jpg" },
];

describe("usePhotoSelection", () => {
  it("selects, toggles and clears a single photo", () => {
    const { result } = renderHook(() => usePhotoSelection(photos));

    act(() => result.current.selectPhoto(photos[0]));
    expect(result.current.selectedIds).toEqual([1]);
    expect(result.current.primaryPhoto).toBe(photos[0]);

    act(() => result.current.selectPhoto(photos[0]));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.primaryPhoto).toBeNull();

    act(() => result.current.selectOnly(photos[2]));
    expect(result.current.selectedIds).toEqual([3]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("uses Ctrl or Meta clicks for additive selection", () => {
    const { result } = renderHook(() => usePhotoSelection(photos));
    const stopPropagation = vi.fn();

    act(() =>
      result.current.handlePhotoSelect(photos[0], {
        detail: 1,
        stopPropagation,
      }),
    );
    act(() =>
      result.current.handlePhotoSelect(photos[1], {
        ctrlKey: true,
        detail: 1,
        stopPropagation,
      }),
    );
    act(() =>
      result.current.handlePhotoSelect(photos[2], {
        metaKey: true,
        detail: 1,
        stopPropagation,
      }),
    );

    expect(result.current.selectedIds).toEqual([1, 2, 3]);
    expect(result.current.primaryPhoto).toBe(photos[2]);
    expect(stopPropagation).toHaveBeenCalledTimes(3);

    act(() =>
      result.current.handlePhotoSelect(photos[1], {
        ctrlKey: true,
        detail: 1,
      }),
    );
    expect(result.current.selectedIds).toEqual([1, 3]);
    expect(result.current.primaryPhoto).toBe(photos[2]);
  });

  it("leaves double-click selection to the Lightbox caller", () => {
    const { result } = renderHook(() => usePhotoSelection(photos));

    let handled;
    act(() => {
      handled = result.current.handlePhotoSelect(photos[0], { detail: 2 });
    });

    expect(handled).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });

  it("drops selections that disappear from a refreshed list", () => {
    const { result, rerender } = renderHook(
      ({ photoList }) => usePhotoSelection(photoList),
      { initialProps: { photoList: photos } },
    );

    act(() => result.current.selectOnly(photos[1]));
    rerender({ photoList: [photos[0], photos[2]] });

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.primaryPhoto).toBeNull();
  });
});
