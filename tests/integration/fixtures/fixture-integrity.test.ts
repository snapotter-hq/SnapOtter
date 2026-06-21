import { execFileSync } from "node:child_process";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fixtures } from "../../fixtures/index.js";

const qpdf = process.env.QPDF_PATH || "qpdf";

describe("real fixtures decode through their real tools", () => {
  // JPEG/PNG/WEBP only -- formats Sharp decodes unconditionally. HEIC/HEIF heroes
  // (portrait.heic, motorcycle.heif) are exercised by the real tool routes in the
  // Phase 2 depth tests, where the factory's HEIC decode path is in play.
  it.each([
    fixtures.image.portrait.jpg,
    fixtures.image.redEye,
    fixtures.image.ocr.clean,
    fixtures.image.ocr.japanese,
    fixtures.image.multiFace,
  ])("Sharp decodes %s with sane dimensions", async (path) => {
    const meta = await sharp(path).metadata();
    expect((meta.width ?? 0) * (meta.height ?? 0)).toBeGreaterThan(64 * 64);
  });

  // Probe via media-engine, which resolves the bundled static ffmpeg/ffprobe.
  // System ffprobe is NOT on PATH in CI (only the static binary is), so a bare
  // `ffprobe` spawn would ENOENT. Gate on ffmpeg presence so a machine with no
  // ffmpeg at all skips cleanly.
  describe.skipIf(!ffmpegAvailable())("media probes", () => {
    it.each([
      fixtures.video.hero.mp4,
      fixtures.video.hero.mov,
      fixtures.video.hero.webm,
      fixtures.video.hero.mkv,
      fixtures.video.hero.avi,
      fixtures.audio.speech.wav,
      fixtures.audio.speech.flac,
      fixtures.audio.speech.ogg,
      fixtures.audio.speech.m4a,
      fixtures.audio.speech.aac,
      fixtures.audio.speech.opus,
      fixtures.audio.tagged,
    ])("media probe reads a positive duration from %s", async (path) => {
      const info = await probeMedia(path);
      expect(info.durationS).toBeGreaterThan(0);
    });
  });

  it.each([
    fixtures.document.pdfMulti,
    fixtures.document.pdfScanned,
  ])("qpdf reports pages for %s", (path) => {
    const out = execFileSync(qpdf, ["--show-npages", path], { encoding: "utf8" });
    expect(Number.parseInt(out.trim(), 10)).toBeGreaterThan(0);
  });
});
