import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadPathPreview } from "./previewLoader";

const serviceMocks = vi.hoisted(() => ({
  getImagePreviewUrl: vi.fn(),
  getPhotoPreviewUrl: vi.fn(),
}));

vi.mock("../services/importService", () => ({
  getImagePreviewUrl: serviceMocks.getImagePreviewUrl,
}));

vi.mock("../services/photoService", () => ({
  getPhotoPreviewUrl: serviceMocks.getPhotoPreviewUrl,
}));

describe("path preview loader", () => {
  beforeEach(() => {
    serviceMocks.getImagePreviewUrl.mockReset();
  });

  it("requests and deduplicates a full-quality import preview", async () => {
    serviceMocks.getImagePreviewUrl.mockResolvedValue("media://import-source/abc");

    const first = loadPathPreview("F:/DCIM/IMG_0001.NEF", true);
    const second = loadPathPreview("F:/DCIM/IMG_0001.NEF", true);

    await expect(first).resolves.toBe("media://import-source/abc");
    await expect(second).resolves.toBe("media://import-source/abc");
    expect(serviceMocks.getImagePreviewUrl).toHaveBeenCalledOnce();
    expect(serviceMocks.getImagePreviewUrl).toHaveBeenCalledWith({
      path: "F:/DCIM/IMG_0001.NEF",
      isRaw: true,
    });
  });
});
