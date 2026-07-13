import { useCallback, useEffect, useRef, useState } from "react";
import { getPhotos } from "../../services/photoService";
import { hasValidCoordinates } from "./mapPhotoUtils";

const PHOTO_QUERY = {
  search: null,
  favoriteOnly: false,
  deletedOnly: false,
  albumId: null,
  ratingFilter: null,
  tagFilter: null,
};

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export default function useMapPhotos() {
  const requestIdRef = useRef(0);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const nextPhotos = await getPhotos(PHOTO_QUERY);
      if (requestId !== requestIdRef.current) return;
      setPhotos(nextPhotos.filter(hasValidCoordinates));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setPhotos([]);
      setError(getErrorMessage(loadError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { photos, loading, error, reload: load };
}
