import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  setZoom: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.isTauri,
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: mocks.setZoom }),
}));

import {
  activateAppScale,
  applyTextScaleVariables,
  resetDisplayRuntimeForTests,
} from "./displayRuntime";

describe("display scale runtime", () => {
  beforeEach(() => {
    mocks.isTauri.mockReturnValue(false);
    mocks.setZoom.mockReset();
    resetDisplayRuntimeForTests();
  });

  afterEach(() => {
    resetDisplayRuntimeForTests();
  });

  it("uses CSS zoom outside Tauri", async () => {
    await expect(activateAppScale(125)).resolves.toBe(true);
    expect(document.documentElement.style.zoom).toBe("1.25");
    expect(mocks.setZoom).not.toHaveBeenCalled();
  });

  it("applies all semantic text scale variables", () => {
    applyTextScaleVariables({
      navigation: 125,
      header: 90,
      content: 150,
      detail: 75,
    });

    expect(document.documentElement.style.getPropertyValue("--text-scale-navigation"))
      .toBe("1.25");
    expect(document.documentElement.style.getPropertyValue("--text-scale-header"))
      .toBe("0.9");
    expect(document.documentElement.style.getPropertyValue("--text-scale-content"))
      .toBe("1.5");
    expect(document.documentElement.style.getPropertyValue("--text-scale-detail"))
      .toBe("0.75");
  });

  it("uses native zoom and serializes rapid requests so the latest wins", async () => {
    mocks.isTauri.mockReturnValue(true);
    let resolveFirst;
    mocks.setZoom
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(undefined);

    const first = activateAppScale(125);
    await vi.waitFor(() => expect(mocks.setZoom).toHaveBeenCalledWith(1.25));
    const second = activateAppScale(150);
    resolveFirst();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(mocks.setZoom).toHaveBeenLastCalledWith(1.5);
    expect(document.documentElement.style.zoom).toBe("");
  });

  it("recovers the queue after a failed native request", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.setZoom
      .mockRejectedValueOnce(new Error("zoom denied"))
      .mockResolvedValueOnce(undefined);

    await expect(activateAppScale(140)).rejects.toThrow("zoom denied");
    await expect(activateAppScale(110)).resolves.toBe(true);
    expect(mocks.setZoom).toHaveBeenLastCalledWith(1.1);
  });
});
