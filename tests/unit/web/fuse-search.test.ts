import { normalizeSearchQuery, TOOLS } from "@snapotter/shared";
import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import { FUSE_OPTIONS } from "@/hooks/use-fuse-search";

function search(q: string) {
  const fuse = new Fuse(TOOLS, FUSE_OPTIONS);
  return fuse.search(normalizeSearchQuery(q)).map((r) => r.item.id);
}

describe("app fuzzy search finds converters by variation", () => {
  it.each([
    ["jpeg to png", "jpg-to-png"],
    ["jpg2png", "jpg-to-png"],
    ["heic jpg", "heic-to-jpg"],
    ["mov mp4", "mov-to-mp4"],
    ["convert mp4 to mp3", "mp4-to-mp3"],
    ["ico", "favicon"],
    ["jpg to ico", "favicon"],
    ["jpg2ico", "favicon"],
    ["png to ico", "favicon"],
    ["png2ico", "favicon"],
  ])("%s finds %s", (q, id) => {
    expect(search(q).slice(0, 5)).toContain(id);
  });
});

describe("a base tool outranks its presets on its own name (#1322)", () => {
  // The five compress-image-to-N-kb presets carry many "compress ..."
  // keywords; the base tool had none, so a bare "compress" ranked every
  // preset first and the pipeline picker's first match was the 20 KB preset.
  it.each([
    ["compress", "compress"],
    ["Compress", "compress"],
    ["compress image", "compress"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it.each([
    ["compress image to 50kb", "compress-image-to-50kb"],
    ["compress to 20 kb", "compress-image-to-20kb"],
    ["20kb", "compress-image-to-20kb"],
  ])("a sized query %s still leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });
});
