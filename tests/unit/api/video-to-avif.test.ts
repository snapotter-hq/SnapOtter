import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerVideoToAvif } from "../../../apps/api/src/routes/tools/video-to-avif.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/** #4827: a short video clip exported as an animated AVIF, like video-to-gif and video-to-webp. */

const ffmpegPresent =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

const MP4 = readFixture(fixtures.video.tiny("mp4"));

let scratchDir: string;

beforeAll(() => {
  registerVideoToAvif({ post: () => undefined } as unknown as FastifyInstance);
});

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "snapotter-video-to-avif-test-"));
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

function run(settings: Record<string, unknown>) {
  const config = getToolConfig("video-to-avif");
  if (!config?.processV2) throw new Error("video-to-avif processV2 must be registered");
  return config.processV2({
    inputs: [{ buffer: MP4, filename: "tiny.mp4", ref: "test/tiny.mp4" }],
    settings,
    scratchDir,
    signal: new AbortController().signal,
    report: () => undefined,
  });
}

interface Probe {
  format: { format_name: string };
  streams: { index: number; codec_name: string; width: number; height: number }[];
  frames: { stream_index: number }[];
}

function probe(path: string): Probe {
  const out = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=format_name:stream=index,codec_name,width,height:frame=stream_index",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  if (out.status !== 0) throw new Error(`ffprobe failed: ${out.stderr}`);
  return JSON.parse(out.stdout);
}

describe("video-to-avif settings", () => {
  it("caps the clip the way video-to-gif does", () => {
    const config = getToolConfig("video-to-avif");
    if (!config) throw new Error("video-to-avif must be registered");
    const schema = config.settingsSchema;

    expect(schema.parse({})).toEqual({
      fps: 12,
      width: 480,
      startS: 0,
      durationS: 5,
      quality: 50,
      loop: true,
    });
    expect(schema.safeParse({ durationS: 61 }).success).toBe(false);
    expect(schema.safeParse({ width: 1281 }).success).toBe(false);
    expect(schema.safeParse({ width: 63 }).success).toBe(false);
    expect(schema.safeParse({ fps: 31 }).success).toBe(false);
  });
});

describe.skipIf(!ffmpegPresent)("video-to-avif against real ffmpeg", () => {
  it("writes an animated AV1 AVIF sequence, rounding an odd width down to even", async () => {
    const result = await run({ fps: 6, width: 121 });

    expect(result.filename).toBe("tiny.avif");
    expect(result.contentType).toBe("image/avif");
    if (!result.scratchPath) throw new Error("video-to-avif must return a scratch path");

    const { format, streams, frames } = probe(result.scratchPath);
    expect(format.format_name).toContain("mp4");
    expect(streams.every((s) => s.codec_name === "av1")).toBe(true);
    expect(streams.every((s) => s.width === 120)).toBe(true);
    const sequence = streams.filter(
      (s) => frames.filter((f) => f.stream_index === s.index).length > 1,
    );
    expect(sequence).toHaveLength(1);
  }, 60_000);

  it("rejects a start time beyond the video instead of running an empty encode", async () => {
    await expect(run({ startS: 30, durationS: 1 })).rejects.toBeInstanceOf(InputValidationError);
  }, 60_000);
});
