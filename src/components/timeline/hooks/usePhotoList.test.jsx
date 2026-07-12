import { act, renderHook, waitFor } from "@testing-library/react";
import { buildPhotoListQuery, usePhotoList } from "./usePhotoList";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("usePhotoList", () => {
  it("preserves all TimelineGrid filter semantics", () => {
    expect(
      buildPhotoListQuery({
        currentView: "favorites",
        albumId: 8,
        ratingFilter: 4,
        tagFilter: "旅行",
        searchQuery: "海边",
      }),
    ).toEqual({
      search: "海边",
      favoriteOnly: true,
      deletedOnly: false,
      albumId: 8,
      ratingFilter: 4,
      tagFilter: "旅行",
    });

    expect(buildPhotoListQuery({ currentView: "trash" })).toEqual({
      search: null,
      favoriteOnly: false,
      deletedOnly: true,
      albumId: null,
      ratingFilter: null,
      tagFilter: null,
    });
  });

  it("loads photos and exposes loading, error and retry state", async () => {
    const requestPhotos = vi
      .fn()
      .mockRejectedValueOnce("仓库暂时不可用")
      .mockResolvedValueOnce([{ id: 2 }]);
    const { result } = renderHook(() =>
      usePhotoList({ currentView: "album", albumId: 5, requestPhotos }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatchObject({
      message: "仓库暂时不可用",
    });

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.photos).toEqual([{ id: 2 }]);
    expect(requestPhotos).toHaveBeenLastCalledWith({
      search: null,
      favoriteOnly: false,
      deletedOnly: false,
      albumId: 5,
      ratingFilter: null,
      tagFilter: null,
    });
  });

  it("ignores a stale response after a newer search finishes", async () => {
    vi.useFakeTimers();
    const olderRequest = deferred();
    const newerRequest = deferred();
    const requestPhotos = vi
      .fn()
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(newerRequest.promise);

    const { result, rerender } = renderHook(
      ({ searchQuery }) =>
        usePhotoList({
          currentView: "albums",
          searchQuery,
          requestPhotos,
        }),
      { initialProps: { searchQuery: "旧搜索" } },
    );

    expect(requestPhotos).toHaveBeenCalledTimes(1);
    rerender({ searchQuery: "新搜索" });
    act(() => vi.advanceTimersByTime(250));
    expect(requestPhotos).toHaveBeenCalledTimes(2);

    await act(async () => {
      newerRequest.resolve([{ id: "new" }]);
      await newerRequest.promise;
    });
    expect(result.current.photos).toEqual([{ id: "new" }]);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      olderRequest.resolve([{ id: "old" }]);
      await olderRequest.promise;
    });
    expect(result.current.photos).toEqual([{ id: "new" }]);

    vi.useRealTimers();
  });

  it("reloads when refreshTrigger changes", async () => {
    const requestPhotos = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(
      ({ refreshTrigger }) =>
        usePhotoList({ currentView: "albums", refreshTrigger, requestPhotos }),
      { initialProps: { refreshTrigger: 0 } },
    );

    await waitFor(() => expect(requestPhotos).toHaveBeenCalledTimes(1));
    rerender({ refreshTrigger: 1 });
    await waitFor(() => expect(requestPhotos).toHaveBeenCalledTimes(2));
  });
});
