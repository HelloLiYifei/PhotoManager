import { beforeEach, describe, expect, it } from "vitest";

import {
  createImportDraft,
  findImportDraft,
  IMPORT_DRAFT_STORAGE_KEY,
  removeImportDraft,
  restoreImportDraft,
  saveImportDraft,
} from "./importDraftStorage";

const photos = [
  {
    absolutePath: "D:/DCIM/one.jpg",
    relativePath: "DCIM/one.jpg",
    size: 100,
    alreadyImported: false,
  },
  {
    absolutePath: "D:/DCIM/two.jpg",
    relativePath: "DCIM/two.jpg",
    size: 200,
    alreadyImported: false,
  },
];

describe("import draft storage", () => {
  beforeEach(() => localStorage.clear());

  it("restores selected photos and album colors after the drive letter changes", () => {
    const draft = createImportDraft({
      scope: "workspace-a",
      sourcePath: "D:/",
      photos,
      selectedPaths: photos.map((photo) => photo.absolutePath),
      photoAlbums: { [photos[1].absolutePath]: "旅行" },
      updatedAt: 10,
    });
    expect(saveImportDraft(localStorage, draft)).toBe(true);

    const reinserted = photos.map((photo) => ({
      ...photo,
      absolutePath: photo.absolutePath.replace("D:/", "F:/"),
    }));
    const matched = findImportDraft(localStorage, {
      scope: "workspace-a",
      photos: reinserted,
    });
    expect(matched).not.toBeNull();
    expect(restoreImportDraft(matched, reinserted)).toEqual({
      selectedPaths: reinserted.map((photo) => photo.absolutePath),
      photoAlbums: { [reinserted[1].absolutePath]: "旅行" },
    });
  });

  it("filters photos already imported during a partial previous attempt", () => {
    const draft = createImportDraft({
      scope: "workspace-a",
      photos,
      selectedPaths: photos.map((photo) => photo.absolutePath),
      photoAlbums: { [photos[1].absolutePath]: "旅行" },
    });
    const rescanned = [
      { ...photos[0], alreadyImported: true },
      photos[1],
    ];

    expect(restoreImportDraft(draft, rescanned)).toEqual({
      selectedPaths: [photos[1].absolutePath],
      photoAlbums: { [photos[1].absolutePath]: "旅行" },
    });
  });

  it("removes only the completed card draft", () => {
    const draft = createImportDraft({ scope: "workspace-a", photos });
    saveImportDraft(localStorage, draft);
    expect(removeImportDraft(localStorage, draft)).toBe(true);
    expect(findImportDraft(localStorage, { scope: "workspace-a", photos })).toBeNull();
    expect(JSON.parse(localStorage.getItem(IMPORT_DRAFT_STORAGE_KEY)).drafts).toEqual([]);
  });
});
