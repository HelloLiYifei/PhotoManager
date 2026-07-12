import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPhotos } from "../../../services/photoService";
import { useDebouncedValue } from "./useDebouncedValue";

export function buildPhotoListQuery({
  currentView,
  albumId,
  ratingFilter = 0,
  tagFilter = "",
  searchQuery = "",
}) {
  return {
    search: searchQuery || null,
    favoriteOnly: currentView === "favorites",
    deletedOnly: currentView === "trash",
    albumId: albumId || null,
    ratingFilter: ratingFilter > 0 ? ratingFilter : null,
    tagFilter: tagFilter || null,
  };
}

function normalizeRequestError(caught) {
  if (caught instanceof Error) return caught;
  if (typeof caught === "string") return new Error(caught);
  return new Error("无法加载照片");
}

export function usePhotoList({
  currentView,
  albumId,
  ratingFilter = 0,
  tagFilter = "",
  searchQuery = "",
  refreshTrigger,
  debounceMs = 250,
  requestPhotos = getPhotos,
}) {
  const debouncedSearchQuery = useDebouncedValue(searchQuery, debounceMs);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const query = useMemo(
    () =>
      buildPhotoListQuery({
        currentView,
        albumId,
        ratingFilter,
        tagFilter,
        searchQuery: debouncedSearchQuery,
      }),
    [albumId, currentView, debouncedSearchQuery, ratingFilter, tagFilter],
  );

  const reload = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const list = await requestPhotos(query);

      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setPhotos(Array.isArray(list) ? list : []);
      }

      return list;
    } catch (caught) {
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setError(normalizeRequestError(caught));
      }

      return undefined;
    } finally {
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [query, requestPhotos]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();

    return () => {
      // Invalidate the request started by this effect when filters change.
      activeRequestIdRef.current += 1;
    };
  }, [refreshTrigger, reload]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
    },
    [],
  );

  return {
    photos,
    setPhotos,
    loading,
    error,
    retry: reload,
    reload,
    debouncedSearchQuery,
  };
}
