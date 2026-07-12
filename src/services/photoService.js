import { invokeCommand } from "./tauriClient";

export const getPhotos = (args) => invokeCommand("get_photos", args);

export const getPhotoThumbnailUrl = (args) => invokeCommand("get_photo_thumbnail_url", args);

export const getPhotoPreviewUrl = (args) => invokeCommand("get_photo_preview_url", args);

export const toggleFavorite = (args) => invokeCommand("toggle_favorite", args);

export const updateRating = (args) => invokeCommand("update_rating", args);

export const deletePhoto = (args) => invokeCommand("delete_photo", args);

export const permanentlyDeletePhoto = (args) => invokeCommand("permanently_delete_photo", args);

export const permanentlyDeletePhotos = (args) => invokeCommand("permanently_delete_photos", args);

export const restorePhotos = (args) => invokeCommand("restore_photos", args);

export const emptyTrashToRecycleBin = () => invokeCommand("empty_trash_to_recycle_bin");

export const getPhotoTags = (args) => invokeCommand("get_photo_tags", args);

export const getAllTags = () => invokeCommand("get_all_tags");

export const addTagToPhoto = (args) => invokeCommand("add_tag_to_photo", args);

export const removeTagFromPhoto = (args) => invokeCommand("remove_tag_from_photo", args);

export const exportPhotos = (args) => invokeCommand("export_photos", args);
