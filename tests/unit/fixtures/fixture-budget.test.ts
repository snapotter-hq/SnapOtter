import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

// Per-extension MB ceilings. RAW/codec containers get headroom; everything else is tight.
const RAW = new Set([".arw", ".nef", ".rw2", ".orf", ".cr2", ".dng", ".exr", ".psd"]);
function capMb(file: string): number {
  const ext = extname(file).toLowerCase();
  if (RAW.has(ext)) return 24;
  if ([".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(ext)) return 8;
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".gif"].includes(ext)) return 8;
  if ([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"].includes(ext)) return 4;
  if ([".pdf", ".docx", ".xlsx", ".pptx", ".epub", ".odt"].includes(ext)) return 4;
  return 1;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (
      e.name === "index.ts" ||
      e.name === ".gitkeep" ||
      e.name.endsWith(".md") ||
      e.name.endsWith(".json") ||
      e.name.endsWith(".mjs")
    )
      return [];
    return [full];
  });
}

describe("fixture size budget", () => {
  const files = walk(ROOT);
  it("finds fixtures", () => expect(files.length).toBeGreaterThan(100));
  it.each(files)("within budget: %s", (f) => {
    const mb = statSync(f).size / (1024 * 1024);
    expect(mb, `${f} is ${mb.toFixed(1)}MB > ${capMb(f)}MB cap`).toBeLessThanOrEqual(capMb(f));
  });
});
