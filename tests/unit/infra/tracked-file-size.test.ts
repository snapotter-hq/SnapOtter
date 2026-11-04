import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const LIMIT_BYTES = 2 * 1024 * 1024;

// Every version of a committed file stays in the history for good, and the
// clone is already several GB. A new large fixture should be generated at test
// time (scripts/generate-test-fixtures.mjs) or cut down before it is committed.
// Add to this list only when a real-world sample can't be shrunk.
const ALLOWED_LARGE_FILES = new Set([
  "tests/baseline/integration.json",
  "tests/fixtures/audio/valid/media-30s.wav",
  "tests/fixtures/image/formats/sample.arw",
  "tests/fixtures/image/formats/sample.cr2",
  "tests/fixtures/image/formats/sample.dng",
  "tests/fixtures/image/formats/sample.nef",
  "tests/fixtures/image/formats/sample.orf",
  "tests/fixtures/image/formats/sample.rw2",
  "tests/fixtures/image/valid/portrait-bw.jpeg",
  "tests/fixtures/image/valid/stress-large.jpg",
  "tests/fixtures/ocr-real/images/jawildtext-board-0127.jpg",
]);

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

describe("tracked file size", () => {
  it(`no tracked file over ${LIMIT_BYTES / 1024 / 1024} MiB unless it is allowlisted`, () => {
    const oversized = trackedFiles().filter((file) => {
      if (ALLOWED_LARGE_FILES.has(file)) return false;
      try {
        return statSync(path.join(root, file)).size > LIMIT_BYTES;
      } catch {
        // Deleted in the working tree but still in the index.
        return false;
      }
    });
    expect(oversized).toEqual([]);
  });
});
