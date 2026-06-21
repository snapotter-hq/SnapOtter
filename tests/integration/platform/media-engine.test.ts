import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia, runFfmpeg } from "@snapotter/media-engine";
import { describe, expect, it } from "vitest";
import { fixtures } from "../../fixtures/index.js";

const FIXTURE = fixtures.video.tiny("mp4");

describe.skipIf(!ffmpegAvailable())("media-engine (requires ffmpeg)", () => {
  it("probes the mp4 fixture with caps", async () => {
    const info = await probeMedia(FIXTURE);
    expect(info.durationS).toBeGreaterThan(0.5);
    expect(info.durationS).toBeLessThan(3);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  });

  it("transcodes with progress events", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-engine-"));
    try {
      const out = join(dir, "out.webm");
      const events: number[] = [];
      await runFfmpeg(["-i", FIXTURE, "-c:v", "libvpx-vp9", "-deadline", "realtime", out], {
        timeoutMs: 60_000,
        onProgress: (p) => {
          if (p.outTimeMs !== null) events.push(p.outTimeMs);
        },
      });
      expect(events.length).toBeGreaterThan(0);
      const info = await probeMedia(out);
      expect(info.streams.some((s) => s.codec === "vp9")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails cleanly when onProgress throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-engine-"));
    try {
      const out = join(dir, "out.mp4");
      await expect(
        runFfmpeg(["-i", FIXTURE, "-c:v", "libx264", "-preset", "ultrafast", out], {
          timeoutMs: 60_000,
          onProgress: () => {
            throw new Error("callback boom");
          },
        }),
      ).rejects.toThrow("callback boom");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects on abort", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-engine-"));
    try {
      const ac = new AbortController();
      ac.abort();
      await expect(
        runFfmpeg(["-i", FIXTURE, "-c:v", "libx264", join(dir, "x.mp4")], { signal: ac.signal }),
      ).rejects.toThrow(/Canceled/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
