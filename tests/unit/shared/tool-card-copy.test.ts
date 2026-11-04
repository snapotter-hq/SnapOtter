import { en, TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

// Converter presets carry generated SEO copy in en.ts by design.
const GENERATED_SUFFIX = " online. Fast, free, private, no signup.";

// Pre-existing drift between en.ts and TOOLS[]. Do not add to this list: fix
// the copy instead. Each entry should be removed as its wording is aligned.
const KNOWN_DRIFT = new Set([
  "edit-metadata",
  "color-blindness",
  "ocr",
  "image-enhancement",
  "colorize",
  "passport-photo",
  "content-aware-resize",
  "meme-generator",
  "border",
  "beautify",
  "vectorize",
]);

describe("home-page card copy", () => {
  it("English card text equals the TOOLS[] description for every hand-written tool card", () => {
    const cards = en.tools as unknown as Record<string, { description?: string }>;
    const drift = TOOLS.filter((tool) => {
      const card = cards[tool.id]?.description;
      return card !== undefined && !card.endsWith(GENERATED_SUFFIX) && !KNOWN_DRIFT.has(tool.id);
    })
      .filter((tool) => cards[tool.id].description !== tool.description)
      .map((tool) => `${tool.id}: "${cards[tool.id].description}" vs "${tool.description}"`);
    expect(drift).toEqual([]);
  });

  it("red-eye-removal card matches its metadata", () => {
    const cards = en.tools as unknown as Record<string, { description?: string }>;
    const tool = TOOLS.find((x) => x.id === "red-eye-removal");
    expect(cards["red-eye-removal"].description).toBe(tool?.description);
  });
});
