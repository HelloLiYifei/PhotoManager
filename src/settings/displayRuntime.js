import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const TEXT_SCALE_REGIONS = ["navigation", "header", "content", "detail"];
let latestRequestId = 0;
let scaleQueue = Promise.resolve();

export function applyTextScaleVariables(textScale) {
  const root = document.documentElement;
  for (const region of TEXT_SCALE_REGIONS) {
    root.style.setProperty(`--text-scale-${region}`, String(textScale[region] / 100));
  }
}

async function applyScale(percent) {
  const factor = percent / 100;
  const root = document.documentElement;

  if (isTauri()) {
    await getCurrentWebview().setZoom(factor);
    root.style.zoom = "";
    return;
  }

  root.style.zoom = String(factor);
}

export function activateAppScale(percent) {
  const requestId = ++latestRequestId;
  const request = scaleQueue
    .catch(() => undefined)
    .then(async () => {
      if (requestId !== latestRequestId) return false;
      await applyScale(percent);
      return requestId === latestRequestId;
    });

  scaleQueue = request;
  return request;
}

export function resetDisplayRuntimeForTests() {
  latestRequestId = 0;
  scaleQueue = Promise.resolve();
  document.documentElement.style.zoom = "";
  for (const region of TEXT_SCALE_REGIONS) {
    document.documentElement.style.removeProperty(`--text-scale-${region}`);
  }
}
