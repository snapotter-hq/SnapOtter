import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { describe, expect, it } from "vitest";
import { MediaInputHandler } from "../../apps/api/src/modality/media-input.js";

const FIX = join(__dirname, "..", "fixtures");
const MP4 = readFileSync(join(FIX, "media", "tiny.mp4"));
const MP3 = readFileSync(join(FIX, "media", "tiny.mp3"));
const SRT = readFileSync(join(FIX, "media", "tiny.srt"));
const PNG = readFileSync(join(FIX, "test-200x150.png"));

function scratch(): { scratchDir: string } {
  return { scratchDir: mkdtempSync(join(tmpdir(), "media-kinds-")) };
}

describe.skipIf(!ffmpegAvailable())("media input kinds", () => {
  it("kind subtitle accepts srt without ffprobe and rejects binaries", async () => {
    const h = new MediaInputHandler("subtitle");
    await expect(h.prepare(SRT, "s.srt", scratch())).resolves.toBeDefined();
    await expect(h.prepare(MP4, "v.srt", scratch())).rejects.toThrow(/subtitle/i);
  });
  it("kind image accepts a still image and rejects audio", async () => {
    const h = new MediaInputHandler("image");
    await expect(h.prepare(PNG, "p.png", scratch())).resolves.toBeDefined();
    await expect(h.prepare(MP3, "a.mp3", scratch())).rejects.toThrow(/image/i);
  });
  it("kind video still rejects audio-only and stills (regression)", async () => {
    const h = new MediaInputHandler("video");
    await expect(h.prepare(MP3, "a.mp3", scratch())).rejects.toThrow(/video/i);
    await expect(h.prepare(PNG, "p.png", scratch())).rejects.toThrow(/still image/i);
  });
});
