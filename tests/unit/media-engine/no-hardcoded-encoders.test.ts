import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #1270 drift guard. Every external ffmpeg encoder is named `lib...`
 * (libx264, libmp3lame, libwebp_anim, ...), and any of them can be missing
 * from a custom FFMPEG_PATH build. Naming one directly skips the inventory
 * check in resolveEncoder, so on a lean build the job dies with "Unknown
 * encoder" and the user is told their file is corrupt.
 *
 * So the names live in one place, SOFTWARE in encoders.ts, and everything else
 * asks resolveEncoder or softwareEncoder. Adding a new external encoder means
 * adding a target there, not a string here.
 */
const ROOT = join(import.meta.dirname, "../../..");
const SCANNED = ["apps/api/src", "packages/media-engine/src"];
const OWNER = "packages/media-engine/src/encoders.ts";

/** A quoted string that is exactly an encoder-style name: "libfoo", 'libfoo' or `libfoo`. */
const LIB_LITERAL = /(["'`])lib[a-z0-9][a-z0-9_-]*\1/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("external encoder names (#1270)", () => {
  it("are only spelled out in encoders.ts", () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (rel === OWNER) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const match of line.matchAll(LIB_LITERAL)) {
            offenders.push(`${rel}:${i + 1} ${match[0]}`);
          }
        });
      }
    }
    expect(
      offenders,
      "Use resolveEncoder(target) (or softwareEncoder for software-only options) instead",
    ).toEqual([]);
  });

  it("still finds the names in encoders.ts, so the pattern has not rotted", () => {
    const source = readFileSync(join(ROOT, OWNER), "utf8");
    const found = [...source.matchAll(LIB_LITERAL)].map((m) => m[0].slice(1, -1));
    expect(found).toEqual(
      expect.arrayContaining(["libx264", "libmp3lame", "libvorbis", "libtheora", "libwebp_anim"]),
    );
  });
});
