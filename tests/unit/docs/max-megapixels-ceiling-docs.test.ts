import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { MAX_RESIZE_OUTPUT_DIMENSION } from "../../../packages/shared/src/constants.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function row(doc: string, name: string): string {
  const line = read(doc)
    .split("\n")
    .find((l) => l.startsWith(`| \`${name}\` |`));
  expect(line, `${doc} has no ${name} row`).toBeDefined();
  return line ?? "";
}

// #4882: the docs said MAX_MEGAPIXELS=0 means unlimited, but every decode
// still runs under sharp's default limitInputPixels, so bigger images are
// refused whatever the variable says.
describe("MAX_MEGAPIXELS docs name the decoder ceiling", () => {
  const side = MAX_RESIZE_OUTPUT_DIMENSION;
  const megapixels = Math.floor((side * side) / 1_000_000);

  test("configuration.md row says 0 still leaves the decoder limit", () => {
    const cell = row("apps/docs/guide/configuration.md", "MAX_MEGAPIXELS");
    expect(cell).not.toMatch(/Set to 0 for unlimited\./);
    expect(cell).toContain(`${side} x ${side}`);
    expect(cell).toContain(`${megapixels} MP`);
  });

  test("low-resource.md row mentions the same ceiling", () => {
    const cell = row("apps/docs/guide/low-resource.md", "MAX_MEGAPIXELS");
    expect(cell).toContain(`${megapixels} MP`);
  });
});
