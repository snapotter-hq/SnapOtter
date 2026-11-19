import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const doc = readFileSync(join(root, "apps/docs/tools/image/bulk-rename.md"), "utf8");

// #4922: since #4401 the route runs every upload through validateImageBuffer
// and fails the whole request on the first non-image, so the page must not
// promise that any file can be renamed.
describe("bulk-rename docs say the tool takes images only", () => {
  test("description and intro say images, not files", () => {
    expect(doc).toMatch(/^description: Rename multiple images/m);
    expect(doc).toMatch(/^Rename multiple images using a pattern template/m);
  });

  test("the request section documents the 400 for a rejected upload", () => {
    expect(doc).toContain("Every upload must be an image.");
    expect(doc).toContain("zipped unchanged (no re-encode)");
    expect(doc).toContain("`MAX_MEGAPIXELS`");
    expect(doc).toContain('`Invalid file "notes.txt": Unrecognized image format`');
  });
});
