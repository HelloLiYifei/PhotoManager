export const IMPORT_DEFAULT_ALBUM_NAME = "默认相册";

const IMPORT_ALBUM_COLORS = Object.freeze([
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#6366F1",
]);

export function getImportAlbumColor(name) {
  if (name === IMPORT_DEFAULT_ALBUM_NAME) return "#3B82F6";

  let hash = 0;
  const albumName = String(name || "");
  for (let index = 0; index < albumName.length; index += 1) {
    hash = albumName.charCodeAt(index) + ((hash << 5) - hash);
  }

  return IMPORT_ALBUM_COLORS[Math.abs(hash) % IMPORT_ALBUM_COLORS.length];
}
