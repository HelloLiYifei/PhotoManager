import { useCallback, useEffect, useState } from "react";

const EMPTY_SELECTION = Object.freeze({
  selectedIds: [],
  primaryPhoto: null,
});

export function usePhotoSelection(photos = []) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);

  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
  }, []);

  const selectOnly = useCallback((photo) => {
    if (!photo) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    setSelection({ selectedIds: [photo.id], primaryPhoto: photo });
  }, []);

  const selectPhoto = useCallback((photo, { additive = false } = {}) => {
    if (!photo) return;

    setSelection((current) => {
      let selectedIds;

      if (additive) {
        selectedIds = current.selectedIds.includes(photo.id)
          ? current.selectedIds.filter((id) => id !== photo.id)
          : [...current.selectedIds, photo.id];
      } else if (
        current.selectedIds.length === 1 &&
        current.selectedIds[0] === photo.id
      ) {
        selectedIds = [];
      } else {
        selectedIds = [photo.id];
      }

      const primaryId = selectedIds.at(-1);
      const primaryPhoto = primaryId === undefined
        ? null
        : photos.find((candidate) => candidate.id === primaryId) ??
          (photo.id === primaryId ? photo : null);

      return { selectedIds, primaryPhoto };
    });
  }, [photos]);

  const handlePhotoSelect = useCallback(
    (photo, event) => {
      event?.stopPropagation?.();

      // Double-click is reserved for the Lightbox entry point.
      if (event?.detail === 2) return false;

      selectPhoto(photo, {
        additive: Boolean(event?.ctrlKey || event?.metaKey),
      });
      return true;
    },
    [selectPhoto],
  );

  useEffect(() => {
    setSelection((current) => {
      if (current.selectedIds.length === 0) return current;

      const availableIds = new Set(photos.map((photo) => photo.id));
      const selectedIds = current.selectedIds.filter((id) => availableIds.has(id));
      const primaryId = selectedIds.at(-1);
      const primaryPhoto = primaryId === undefined
        ? null
        : photos.find((photo) => photo.id === primaryId) ?? null;

      const idsUnchanged =
        selectedIds.length === current.selectedIds.length &&
        selectedIds.every((id, index) => id === current.selectedIds[index]);

      if (idsUnchanged && primaryPhoto === current.primaryPhoto) return current;
      return { selectedIds, primaryPhoto };
    });
  }, [photos]);

  return {
    selectedIds: selection.selectedIds,
    primaryPhoto: selection.primaryPhoto,
    clearSelection,
    selectOnly,
    selectPhoto,
    handlePhotoSelect,
  };
}
