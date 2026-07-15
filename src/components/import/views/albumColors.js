import {
  ALBUM_COLOR_PALETTE,
  DEFAULT_ALBUM_COLOR,
} from "../../../content/contentColors";

export const IMPORT_DEFAULT_ALBUM_NAME = "默认相册";

export function getImportAlbumColor(name) {
  if (name === IMPORT_DEFAULT_ALBUM_NAME) return DEFAULT_ALBUM_COLOR;

  let hash = 0;
  const albumName = String(name || "");
  for (let index = 0; index < albumName.length; index += 1) {
    hash = albumName.charCodeAt(index) + ((hash << 5) - hash);
  }

  return ALBUM_COLOR_PALETTE[Math.abs(hash) % ALBUM_COLOR_PALETTE.length];
}
