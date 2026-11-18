import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Translation syncs bring em dashes back (#4741, after #4186 removed them), so
// every tracked text file under these trees is scanned. The character is
// built from its code point so this file does not trip its own check.
const EM_DASH = String.fromCharCode(0x2014);
const TREES = ["apps", "packages", "scripts", "tests"];

describe("no em dashes in source trees (#4186, #4741)", () => {
  it("finds no U+2014 in tracked text files", () => {
    const root = process.cwd();
    const files = execFileSync("git", ["ls-files", "-z", "--", ...TREES], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(1000);

    const offenders: string[] = [];
    for (const file of files) {
      let buf: Buffer;
      try {
        buf = readFileSync(join(root, file));
      } catch {
        continue;
      }
      if (buf.includes(0)) continue;
      buf
        .toString("utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(EM_DASH)) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
