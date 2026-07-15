export const IMPORT_DRAFT_STORAGE_KEY = "photomanager-import-drafts-v1";
export const DEFAULT_IMPORT_ALBUM_NAME = "默认相册";

const MAX_SAVED_DRAFTS = 8;

function availableStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizedRelativePath(path) {
  return String(path || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

export function getImportPhotoKey(photo) {
  return `${normalizedRelativePath(photo?.relativePath)}\u0000${Number(photo?.size || 0)}`;
}

function hashKeys(keys) {
  let hash = 2166136261;
  const input = keys.join("\u0001");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getImportSourceSignature(photos) {
  const keys = (Array.isArray(photos) ? photos : [])
    .map(getImportPhotoKey)
    .sort();
  if (keys.length === 0) return "";
  return `${keys.length}:${hashKeys(keys)}`;
}

function readDraftState(storage) {
  const target = availableStorage(storage);
  if (!target) return { version: 1, drafts: [] };
  try {
    const parsed = JSON.parse(target.getItem(IMPORT_DRAFT_STORAGE_KEY) || "null");
    if (parsed?.version !== 1 || !Array.isArray(parsed.drafts)) {
      return { version: 1, drafts: [] };
    }
    return parsed;
  } catch {
    return { version: 1, drafts: [] };
  }
}

function writeDraftState(storage, state) {
  const target = availableStorage(storage);
  if (!target) return false;
  try {
    target.setItem(IMPORT_DRAFT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function createImportDraft({
  scope = "default",
  sourcePath = "",
  photos = [],
  selectedPaths = [],
  photoAlbums = {},
  updatedAt = Date.now(),
}) {
  const signature = getImportSourceSignature(photos);
  if (!signature) return null;

  const selected = new Set(selectedPaths);
  const selections = photos
    .filter((photo) => selected.has(photo.absolutePath) && !photo.alreadyImported)
    .map((photo) => ({
      photoKey: getImportPhotoKey(photo),
      albumName: photoAlbums[photo.absolutePath] || DEFAULT_IMPORT_ALBUM_NAME,
    }));

  return {
    version: 1,
    scope: String(scope || "default"),
    sourcePath: String(sourcePath || ""),
    sourceSignature: signature,
    updatedAt,
    selections,
  };
}

export function saveImportDraft(storage, draft) {
  if (!draft?.sourceSignature) return false;
  const state = readDraftState(storage);
  const drafts = state.drafts
    .filter((candidate) => !(
      candidate.scope === draft.scope
      && candidate.sourceSignature === draft.sourceSignature
    ))
    .concat(draft)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, MAX_SAVED_DRAFTS);
  return writeDraftState(storage, { version: 1, drafts });
}

export function findImportDraft(storage, { scope = "default", photos = [] } = {}) {
  const signature = getImportSourceSignature(photos);
  if (!signature) return null;
  return readDraftState(storage).drafts.find((draft) => (
    draft.scope === String(scope || "default")
    && draft.sourceSignature === signature
  )) || null;
}

export function removeImportDraft(storage, draft) {
  if (!draft?.sourceSignature) return false;
  const state = readDraftState(storage);
  return writeDraftState(storage, {
    version: 1,
    drafts: state.drafts.filter((candidate) => !(
      candidate.scope === draft.scope
      && candidate.sourceSignature === draft.sourceSignature
    )),
  });
}

export function restoreImportDraft(draft, photos = []) {
  const selectionsByKey = new Map(
    (Array.isArray(draft?.selections) ? draft.selections : [])
      .map((selection) => [selection.photoKey, selection.albumName]),
  );
  const selectedPaths = [];
  const photoAlbums = {};

  photos.forEach((photo) => {
    if (photo.alreadyImported) return;
    const albumName = selectionsByKey.get(getImportPhotoKey(photo));
    if (!albumName) return;
    selectedPaths.push(photo.absolutePath);
    if (albumName !== DEFAULT_IMPORT_ALBUM_NAME) {
      photoAlbums[photo.absolutePath] = albumName;
    }
  });

  return { selectedPaths, photoAlbums };
}
