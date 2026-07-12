import { invokeCommand, listenToEvent } from "./tauriClient";

export const detectCards = () => invokeCommand("detect_cards");

export const scanCard = (args) => invokeCommand("scan_card", args);

export const importPhotos = (args) => invokeCommand("import_photos", args);

export const getImageThumbnailUrl = (args) => invokeCommand("get_image_thumbnail_url", args);

export const listenToImportProgress = (handler) => (
  listenToEvent("import-progress", handler)
);
