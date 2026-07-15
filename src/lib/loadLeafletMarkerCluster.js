import L from "leaflet";

let pluginPromise;

export function ensureLeafletMarkerCluster() {
  if (typeof L.markerClusterGroup === "function") {
    return Promise.resolve(true);
  }

  // leaflet.markercluster is distributed as UMD and expects Leaflet on the
  // global object. Load it only after exposing the same Leaflet instance used
  // by the map, which also keeps non-browser test imports safe.
  globalThis.L = L;
  pluginPromise ??= import("leaflet.markercluster").then(
    () => typeof L.markerClusterGroup === "function",
  );
  return pluginPromise;
}
