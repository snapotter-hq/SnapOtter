import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractPart, splitEvery } from "../../../apps/api/src/routes/tools/split-audio.js";

// Stream-copied FLAC parts kept the source's STREAMINFO total and Opus parts
// kept the source's running granule positions, so parts probed as the whole
// input's length (#4885).
describe.skipIf(!ffmpegAvailable())("split-audio part durations (#4885)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "split-audio-dur-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // A fresh directory per case, since flac and FLAC collide on case-insensitive disks.
  function caseDir(): string {
    return mkdtempSync(join(tmpDir, "case-"));
  }

  function tone(dir: string, name: string, seconds: number): string {
    const out = join(dir, name);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=f=440:d=${seconds}:sample_rate=48000`,
      "-ac",
      "2",
      out,
    ]);
    return out;
  }

  async function durationOf(path: string): Promise<number> {
    return (await probeMedia(path)).durationS ?? 0;
  }

  it.each(["flac", "opus", "FLAC"])(
    "splitEvery gives .%s parts their own length",
    async (ext) => {
      const dir = caseDir();
      const input = tone(dir, `twenty.${ext}`, 20);
      const outDir = join(dir, "parts");
      mkdirSync(outDir);

      await splitEvery(input, 10.05, join(outDir, `part-%03d.${ext}`), {});

      const parts = readdirSync(outDir).sort();
      expect(parts).toEqual([`part-000.${ext}`, `part-001.${ext}`]);
      for (const part of parts) {
        const durationS = await durationOf(join(outDir, part));
        expect(durationS).toBeGreaterThan(9);
        expect(durationS).toBeLessThan(11);
      }
    },
    30_000,
  );

  it("splitEvery still splits non-FLAC inputs", async () => {
    const dir = caseDir();
    const input = tone(dir, "twenty.mp3", 20);
    const outDir = join(dir, "parts");
    mkdirSync(outDir);

    await splitEvery(input, 10.05, join(outDir, "part-%03d.mp3"), {});

    expect(readdirSync(outDir).sort()).toEqual(["part-000.mp3", "part-001.mp3"]);
  }, 30_000);

  it.each(["flac", "opus", "mp3"])(
    "extractPart gives a .%s range its own length",
    async (ext) => {
      const dir = caseDir();
      const input = tone(dir, `range.${ext}`, 20);
      const partPath = join(dir, `part.${ext}`);

      await extractPart(input, 12, 18, partPath, {});

      const durationS = await durationOf(partPath);
      expect(durationS).toBeGreaterThan(5.5);
      expect(durationS).toBeLessThan(6.5);
    },
    30_000,
  );
});
