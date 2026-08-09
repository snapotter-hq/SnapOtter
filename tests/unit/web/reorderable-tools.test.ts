import { TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { REORDERABLE_TOOLS } from "@/lib/tool-display-modes";

describe("REORDERABLE_TOOLS", () => {
  it("only references real tool ids (a typo would silently disable reorder)", () => {
    const known = new Set(TOOLS.map((t) => t.id));
    for (const id of REORDERABLE_TOOLS) {
      expect(known.has(id), `REORDERABLE_TOOLS entry "${id}" is not a real tool`).toBe(true);
    }
  });

  it("includes order-sensitive combine tools", () => {
    for (const id of [
      "merge-pdf",
      "merge-audio",
      "merge-videos",
      "merge-csvs",
      "images-to-video",
      "sprite-sheet",
      "stitch",
      "collage",
    ]) {
      expect(REORDERABLE_TOOLS.has(id)).toBe(true);
    }
  });

  it("includes image-to-pdf conversion presets whose page order matters", () => {
    expect(REORDERABLE_TOOLS.has("jpg-to-pdf")).toBe(true);
  });

  it("excludes per-file batch tools where order is irrelevant", () => {
    for (const id of ["compress", "convert", "content-aware-resize"]) {
      expect(REORDERABLE_TOOLS.has(id)).toBe(false);
    }
  });

  it("excludes mixed-modality pairs distinguished by kind, not position", () => {
    for (const id of ["burn-subtitles", "embed-subtitles", "replace-audio"]) {
      expect(REORDERABLE_TOOLS.has(id)).toBe(false);
    }
  });
});
