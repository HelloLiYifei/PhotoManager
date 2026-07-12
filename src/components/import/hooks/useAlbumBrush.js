import { useCallback, useRef, useState } from "react";

import { getImportAlbumColor } from "../views/albumColors";
import { DEFAULT_IMPORT_ALBUM_NAME } from "./useImportWizardData";

export default function useAlbumBrush({
  photos,
  selectedPaths,
  setSelectedPaths,
  photoAlbums,
  setPhotoAlbums,
  alreadyImportedPaths,
}) {
  const [brushAlbum, setBrushAlbum] = useState(null);
  const selectedPathsRef = useRef(selectedPaths);
  const photoAlbumsRef = useRef(photoAlbums);
  selectedPathsRef.current = selectedPaths;
  photoAlbumsRef.current = photoAlbums;

  const applyBrushColor = useCallback((path) => {
    if (!brushAlbum || alreadyImportedPaths.has(path)) return false;

    const isSelected = selectedPathsRef.current.includes(path);
    const currentAlbum = isSelected
      ? photoAlbumsRef.current[path] || DEFAULT_IMPORT_ALBUM_NAME
      : null;
    const shouldDeselect = brushAlbum === DEFAULT_IMPORT_ALBUM_NAME
      && currentAlbum === DEFAULT_IMPORT_ALBUM_NAME;

    setSelectedPaths((current) => {
      if (shouldDeselect) return current.filter((selectedPath) => selectedPath !== path);
      return current.includes(path) ? current : [...current, path];
    });
    setPhotoAlbums((current) => {
      const updated = { ...current };
      if (shouldDeselect || brushAlbum === DEFAULT_IMPORT_ALBUM_NAME) {
        delete updated[path];
      } else {
        updated[path] = brushAlbum;
      }
      return updated;
    });
    return true;
  }, [alreadyImportedPaths, brushAlbum, setPhotoAlbums, setSelectedPaths]);

  const colorAll = useCallback(() => {
    const targetAlbum = brushAlbum || DEFAULT_IMPORT_ALBUM_NAME;
    const paths = photos
      .filter((photo) => !photo.alreadyImported)
      .map((photo) => photo.absolutePath);

    setSelectedPaths(paths);
    setPhotoAlbums(
      targetAlbum === DEFAULT_IMPORT_ALBUM_NAME
        ? {}
        : Object.fromEntries(paths.map((path) => [path, targetAlbum])),
    );
  }, [brushAlbum, photos, setPhotoAlbums, setSelectedPaths]);

  const clearColors = useCallback(() => {
    setSelectedPaths([]);
    setPhotoAlbums({});
  }, [setPhotoAlbums, setSelectedPaths]);

  const getPhotoVisualState = useCallback((photo, focusedPath = null) => {
    const isChecked = selectedPaths.includes(photo.absolutePath);
    const targetAlbum = isChecked
      ? photoAlbums[photo.absolutePath] || DEFAULT_IMPORT_ALBUM_NAME
      : null;
    return {
      isChecked,
      isFocused: focusedPath === photo.absolutePath,
      targetAlbum,
      albumColor: targetAlbum ? getImportAlbumColor(targetAlbum) : "transparent",
    };
  }, [photoAlbums, selectedPaths]);

  return {
    brushAlbum,
    setBrushAlbum,
    applyBrushColor,
    colorAll,
    clearColors,
    getPhotoVisualState,
  };
}
