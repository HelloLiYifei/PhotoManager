import { invoke } from "@tauri-apps/api/core";

const urlCache = new Map();
const inFlight = new Map();
const preloadedImages = new Map();
const MAX_PRELOADED_IMAGES = 4;

export function loadPhotoPreview(id) {
  const cached = urlCache.get(id);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const promise = invoke("get_photo_preview_url", { id })
    .then((url) => {
      urlCache.set(id, url);
      return url;
    })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
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
