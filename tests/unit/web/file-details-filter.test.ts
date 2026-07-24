// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getFilesToOpen } from "@/components/files/file-details";
import type { UserFile, UserFileDetail } from "@/lib/api";

const image: UserFile = {
  id: "image-file",
  originalName: "photo.png",
  mimeType: "image/png",
  size: 1024,
  width: 100,
  height: 100,
  version: 1,
  toolChain: [],
  createdAt: "2026-07-24T00:00:00.000Z",
};

const video: UserFile = {
  ...image,
  id: "video-file",
  originalName: "clip.mp4",
  mimeType: "video/mp4",
};

const secondImage: UserFile = {
  ...image,
  id: "second-image-file",
  originalName: "second.png",
};

function details(file: UserFile): UserFileDetail {
  return { ...file, versions: [] };
}

describe("filtered file imports", () => {
  it("rejects a stale selected file that does not match the requested MIME prefix", () => {
    expect(
      getFilesToOpen({
        details: details(video),
        files: [image, video],
        checkedIds: new Set(),
        filterMimePrefix: "image/",
      }),
    ).toEqual([]);
  });

  it("removes incompatible files from a mixed checked batch", () => {
    expect(
      getFilesToOpen({
        details: details(image),
        files: [image, video],
        checkedIds: new Set([image.id, video.id]),
        filterMimePrefix: "image/",
      }),
    ).toEqual([details(image)]);
  });

  it("falls back to the selected file when every checked file is incompatible", () => {
    expect(
      getFilesToOpen({
        details: details(image),
        files: [image, video],
        checkedIds: new Set([video.id, "missing-video"]),
        filterMimePrefix: "image/",
      }),
    ).toEqual([details(image)]);
  });

  it("does not replace the selected file with one compatible checkbox from a mixed batch", () => {
    expect(
      getFilesToOpen({
        details: details(image),
        files: [image, secondImage, video],
        checkedIds: new Set([secondImage.id, video.id]),
        filterMimePrefix: "image/",
      }),
    ).toEqual([details(image)]);
  });
});
