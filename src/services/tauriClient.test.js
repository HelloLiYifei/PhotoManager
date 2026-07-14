import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  TauriServiceError,
  camelizeKeys,
  invokeCommand,
  listenToEvent,
} from "./tauriClient";
import { getAlbumSummaries } from "./albumService";
import { importPhotos } from "./importService";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("Tauri service client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes nested command responses to camelCase", async () => {
    invoke.mockResolvedValueOnce({
      cover_photo_id: "photo-1",
      photo_count: 2,
      nested_items: [{ current_file: "IMG_0001.JPG" }],
    });

    await expect(invokeCommand("get_album_summaries")).resolves.toEqual({
      coverPhotoId: "photo-1",
      photoCount: 2,
      nestedItems: [{ currentFile: "IMG_0001.JPG" }],
    });
    expect(invoke).toHaveBeenCalledWith("get_album_summaries", undefined);
  });

  it("leaves primitives and null values unchanged", () => {
    expect(camelizeKeys([null, "photo", 3, false])).toEqual([null, "photo", 3, false]);
  });

  it("wraps command failures with command context", async () => {
    invoke.mockRejectedValueOnce("数据库未连接");

    const error = await invokeCommand("get_photos").catch((caught) => caught);

    expect(error).toBeInstanceOf(TauriServiceError);
    expect(error).toMatchObject({
      command: "get_photos",
      cause: "数据库未连接",
      message: "数据库未连接",
    });
    expect(String(error)).toBe("数据库未连接");
  });

  it("normalizes event payloads and returns the unlisten callback", async () => {
    const unlisten = vi.fn();
    const handler = vi.fn();
    let emit;
    listen.mockImplementationOnce(async (_eventName, listener) => {
      emit = listener;
      return unlisten;
    });

    await expect(listenToEvent("import-progress", handler)).resolves.toBe(unlisten);
    emit({ id: 7, payload: { current_file: "IMG_0002.JPG", copied: 1 } });

    expect(listen).toHaveBeenCalledWith("import-progress", expect.any(Function));
    expect(handler).toHaveBeenCalledWith({
      id: 7,
      payload: { currentFile: "IMG_0002.JPG", copied: 1 },
    });
  });

  it("uses the aggregate album command", async () => {
    invoke.mockResolvedValueOnce([]);

    await getAlbumSummaries();

    expect(invoke).toHaveBeenCalledWith("get_album_summaries", undefined);
  });

  it("preserves nested import DTO keys sent to Rust", async () => {
    invoke.mockResolvedValueOnce(1);
    const args = {
      imports: [{ absolute_path: "D:/DCIM/IMG_0001.JPG", album_name: "默认相册" }],
    };

    await importPhotos(args);

    expect(invoke).toHaveBeenCalledWith("import_photos", args);
  });
});
