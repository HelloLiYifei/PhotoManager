import { invoke } from "@tauri-apps/api/core";

const MAX_CONCURRENT_REQUESTS = 6;
const MAX_CACHE_ENTRIES = 180;

const cache = new Map();
const inFlight = new Map();
const queue = [];
let activeRequests = 0;

function remember(key, value) {
  cache.delete(key);
  cache.set(key, value);

  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function runQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    // Visible cards win over look-ahead work.  Without this, a just-visible
    // image can wait behind an entire prefetched row on slow removable media.
    queue.sort((left, right) => right.priority - left.priority);
    const request = queue.shift();
    activeRequests += 1;

    invoke(request.command, request.args)
      .then((result) => {
        remember(request.key, result);
        request.resolve(result);
      })
      .catch(request.reject)
      .finally(() => {
        inFlight.delete(request.key);
        activeRequests -= 1;
        runQueue();
      });
  }
}

function loadThumbnail(key, command, args, priority = 0) {
  const cached = cache.get(key);
  if (cached) {
    // Refresh the entry's position so frequently revisited views stay hot.
    remember(key, cached);
    return Promise.resolve(cached);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = new Promise((resolve, reject) => {
    queue.push({ key, command, args, priority, resolve, reject });
    runQueue();
  });
  inFlight.set(key, promise);
  return promise;
}

export function loadPhotoThumbnail(id, priority) {
  return loadThumbnail(`photo:${id}`, "get_photo_thumbnail_url", { id }, priority);
}

export function loadPathThumbnail(path, isRaw, priority) {
  return loadThumbnail(`path:${path}:${isRaw}`, "get_image_thumbnail_url", {
    path,
    isRaw,
  }, priority);
}
