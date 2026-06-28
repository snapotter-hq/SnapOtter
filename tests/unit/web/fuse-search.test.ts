import { normalizeSearchQuery, TOOLS } from "@snapotter/shared";
import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";

const OPTS = {
  keys: [
    { name: "name", weight: 0.35 },
    { name: "description", weight: 0.25 },
    { name: "keywords", weight: 0.3 },
    { name: "modality", weight: 0.15 },
    { name: "id", weight: 0.15 },
    { name: "category", weight: 0.1 },
  ],
  threshold: 0.45,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

function search(q: string) {
  const fuse = new Fuse(TOOLS, OPTS as never);
  return fuse.search(normalizeSearchQuery(q)).map((r) => r.item.id);
}

describe("app fuzzy search finds converters by variation", () => {
  it.each([
    ["jpeg to png", "jpg-to-png"],
    ["jpg2png", "jpg-to-png"],
    ["heic jpg", "heic-to-jpg"],
    ["mov mp4", "mov-to-mp4"],
    ["convert mp4 to mp3", "mp4-to-mp3"],
  ])("%s finds %s", (q, id) => {
    expect(search(q).slice(0, 5)).toContain(id);
  });
});
