import { invokeCommand } from "./tauriClient";

export const getAlbums = () => invokeCommand("get_albums");

export const getAlbumSummaries = () => invokeCommand("get_album_summaries");

export const createAlbum = (args) => invokeCommand("create_album", args);

export const movePhotosToAlbum = (args) => invokeCommand("move_photos_to_album", args);
