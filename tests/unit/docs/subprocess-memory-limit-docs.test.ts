import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function row(doc: string, name: string): string {
  const line = read(doc)
    .split("\n")
    .find((l) => l.startsWith(`| \`${name}\` |`));
  expect(line, `${doc} has no ${name} row`).toBeDefined();
  return line ?? "";
}

// #5267: operators had to guess the cap, and a guess like 1024 fails an
// ordinary 24 MP HEIC or JXL encode once the encoders run under it (#5215).
describe("SUBPROCESS_MEMORY_LIMIT_MB docs give a sizing figure", () => {
  const cell = () => row("apps/docs/guide/configuration.md", "SUBPROCESS_MEMORY_LIMIT_MB");

  test("names the image encoders and the sizing figures for 24 MP", () => {
    expect(cell()).toMatch(/JPEG XL encoder needs the most/);
    expect(cell()).toMatch(/HEIF encoder is held to two worker threads/);
    expect(cell()).toContain("24 MP");
    expect(cell()).toContain("1.8 GB");
    expect(cell()).toContain("`2048`");
  });

  test("no longer says exiftool and the ffmpeg fallback are uncapped", () => {
    expect(cell()).not.toMatch(/exiftool and their ffmpeg fallback\) aren't capped/);
    expect(cell()).toMatch(/ImageMagick isn't capped/);
    expect(cell()).toMatch(/neither is the AI sidecar/);
  });
});
