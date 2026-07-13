import { getImagePreviewUrl } from "../services/importService";
import { getPhotoPreviewUrl } from "../services/photoService";

const urlCache = new Map();
const inFlight = new Map();
const preloadedImages = new Map();
const MAX_PRELOADED_IMAGES = 4;

export function loadPhotoPreview(id) {
  const cached = urlCache.get(id);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const promise = getPhotoPreviewUrl({ id })
    .then((url) => {
      urlCache.set(id, url);
      return url;
    })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
  return promise;
}

export function loadPathPreview(path, isRaw = false) {
  const key = `path:${path}:${Boolean(isRaw)}`;
  const cached = urlCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = getImagePreviewUrl({ path, isRaw: Boolean(isRaw) })
    .then((url) => {
      urlCache.set(key, url);
      return url;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function prefetchPhotoPreview(id) {
  if (!id || preloadedImages.has(id)) return;
  loadPhotoPreview(id)
    .then((url) => {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      preloadedImages.set(id, image);
      while (preloadedImages.size > MAX_PRELOADED_IMAGES) {
        preloadedImages.delete(preloadedImages.keys().next().value);
      }
    })
    .catch(() => {});
}
