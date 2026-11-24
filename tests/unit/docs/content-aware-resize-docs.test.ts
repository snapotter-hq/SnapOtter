import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const toolPage = readFileSync(join(root, "apps/docs/tools/image/content-aware-resize.md"), "utf8");
const aiReference = readFileSync(join(root, "apps/docs/api/ai.md"), "utf8");

// #4999: seamCarve grows each side by seam insertion up to MAX_ENLARGE_RATIO
// (2x) in packages/ai/src/seam-carving.ts, so the docs must not call the tool
// shrink-only.
describe("content-aware resize docs say the tool can enlarge up to 2x", () => {
  test("the tool page notes enlargement and its cap", () => {
    expect(toolPage).not.toContain("Only reduces dimensions");
    expect(toolPage).not.toContain("Cannot expand an image");
    expect(toolPage).toContain(
      "- Shrinks by removing seams or enlarges by inserting them. Each side can grow to at most 2x its original size.",
    );
  });

  test("the AI API reference describes both directions and the cap", () => {
    expect(aiReference).not.toContain("Intelligently resizes images by removing low-energy seams");
    expect(aiReference).toContain(
      "Intelligently resizes images by removing or inserting low-energy seams, preserving important content. Each side can grow to at most 2x its original size.",
    );
  });
});
