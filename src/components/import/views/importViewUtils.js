import { IMPORTED_PHOTO_BORDER_COLOR } from "../../../content/contentColors";

export function getImportPhotoState(photo, getPhotoVisualState) {
  const state = getPhotoVisualState?.(photo) || {};
  return {
    isChecked: Boolean(state.isChecked),
    isFocused: Boolean(state.isFocused),
    targetAlbum: state.targetAlbum || null,
    albumColor: state.albumColor || "transparent",
    hasHiddenRawCompanion: Boolean(state.hasHiddenRawCompanion),
  };
}

export function getImportPhotoPairKey(photo) {
  const path = String(photo?.relativePath || photo?.absolutePath || "")
    .replace(/\\/g, "/");
  const slashIndex = path.lastIndexOf("/");
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex <= slashIndex + 1) return null;
  return path.slice(0, dotIndex).toLowerCase();
}

export function isImportJpeg(photo) {
  const path = String(photo?.relativePath || photo?.absolutePath || "");
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return extension === "jpg" || extension === "jpeg";
}

export function getImportPhotoStyle(photo, state) {
  return {
    "--import-album-color": state.albumColor,
    "--import-border-color": photo.alreadyImported
      ? IMPORTED_PHOTO_BORDER_COLOR
      : state.targetAlbum
        ? state.albumColor
        : "transparent",
  };
}

export function handleImportPhotoMouseDown({
  event,
  photo,
  brushAlbum,
  onActivatePhoto,
  onBrushPhoto,
}) {
  event.preventDefault();
  onActivatePhoto?.(photo);
  if (brushAlbum && !photo.alreadyImported) {
    onBrushPhoto?.(photo, event);
  }
}

export function handleImportPhotoMouseEnter({
  event,
  photo,
  brushAlbum,
  onBrushEnter,
}) {
  if (brushAlbum && !photo.alreadyImported) {
    onBrushEnter?.(photo, event);
  }
}

export function handleImportPhotoKeyDown({
  event,
  photo,
  brushAlbum,
  onActivatePhoto,
  onBrushPhoto,
}) {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  event.preventDefault();
  onActivatePhoto?.(photo);
  if (brushAlbum && !photo.alreadyImported) {
    onBrushPhoto?.(photo, event);
  }
}

export function formatImportFileSize(bytes) {
  return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(2)} MB`;
}

export function importFileType(photo) {
  if (photo.isRaw) return "RAW";
  const extension = photo.relativePath?.split(".").pop();
  return extension && extension !== photo.relativePath ? extension.toUpperCase() : "—";
}
