import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStreamInfo } from "../../../packages/media-engine/src/index.js";

/**
 * WAV output used to be hardcoded to pcm_s16le, so a 24-bit FLAC or AIFF came
 * back 16-bit with the bottom 8 bits truncated (#4969). The PCM codec now
 * follows the source's probed bit depth.
 *
 * The routes are closures handed to createToolRoute, so the factory just
 * records the config. probeMedia and runFfmpeg are replaced, since CI has no
 * ffmpeg (the convert-audio and merge-audio integration tests cover the real
 * binary).
 */

type RouteConfig = {
  toolId: string;
  processV2: (ctx: unknown) => Promise<{ filename: string; contentType: string }>;
};

const registered: RouteConfig[] = [];
const probeQueue: { current: MediaStreamInfo[][] } = { current: [] };

const runFfmpeg = vi.fn(async (_args: string[]) => "");

vi.mock("../../../packages/media-engine/src/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/media-engine/src/index.js")>();
  return {
    ...actual,
    resolveEncoder: vi.fn((kind: string) => kind),
    probeMedia: vi.fn(async () => ({
      durationS: 1,
      streams: probeQueue.current.shift() ?? [],
    })),
    runFfmpeg: (args: string[]) => runFfmpeg(args),
  };
});

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

const { wavPcmCodec } = await import("../../../apps/api/src/lib/media-tool.js");
const { registerConvertAudio } = await import(
  "../../../apps/api/src/routes/tools/convert-audio.js"
);
const { registerExtractAudio } = await import(
  "../../../apps/api/src/routes/tools/extract-audio.js"
);
const { registerMergeAudio } = await import("../../../apps/api/src/routes/tools/merge-audio.js");
registerConvertAudio({} as never);
registerExtractAudio({} as never);
registerMergeAudio({} as never);

function routeFor(toolId: string): RouteConfig {
  const route = registered.find((r) => r.toolId === toolId);
  if (!route) throw new Error(`${toolId} was not registered`);
  return route;
}

const audio = (codec: string, sampleFmt: string, bitsPerSample?: number): MediaStreamInfo => ({
  type: "audio",
  codec,
  sampleFmt,
  bitsPerSample,
  sampleRate: 44_100,
  channels: 2,
});

// What ffprobe reports for each source, measured with ffmpeg 8.
const FLAC_24 = audio("flac", "s32", 24);
const FLAC_16 = audio("flac", "s16", 16);
const AIFF_24 = audio("pcm_s24be", "s32", 24);
const ALAC_24 = audio("alac", "s32p", 24);
const WAV_32 = audio("pcm_s32le", "s32", 32);
const WAV_FLOAT = audio("pcm_f32le", "flt", 32);
const WAV_U8 = audio("pcm_u8", "u8", 8);
const MP3 = audio("mp3", "fltp");

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "wav-bit-depth-unit-"));
  runFfmpeg.mockClear();
  probeQueue.current = [];
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

function ctxFor(settings: Record<string, unknown>, filenames: string[]) {
  return {
    inputs: filenames.map((filename) => ({ buffer: Buffer.from("audio"), filename, ref: "r" })),
    settings,
    scratchDir,
    signal: new AbortController().signal,
    report: () => undefined,
  };
}

function codecArg(): string {
  expect(runFfmpeg).toHaveBeenCalledTimes(1);
  const args = runFfmpeg.mock.calls[0][0];
  return args[args.indexOf("-c:a") + 1];
}

describe("wavPcmCodec (#4969)", () => {
  it.each([
    ["24-bit FLAC", FLAC_24, "pcm_s24le"],
    ["24-bit AIFF", AIFF_24, "pcm_s24le"],
    ["24-bit ALAC", ALAC_24, "pcm_s24le"],
    ["32-bit integer WAV", WAV_32, "pcm_s32le"],
    ["32-bit float WAV", WAV_FLOAT, "pcm_f32le"],
    ["64-bit float WAV, capped at 32-bit float", audio("pcm_f64le", "dbl", 64), "pcm_f32le"],
    ["16-bit FLAC", FLAC_16, "pcm_s16le"],
    ["8-bit WAV", WAV_U8, "pcm_s16le"],
    ["a lossy MP3, where more bits buy nothing", MP3, "pcm_s16le"],
  ])("writes %s as %s", (_label, stream, codec) => {
    expect(wavPcmCodec([stream])).toBe(codec);
  });

  it("falls back to 16-bit when nothing was probed", () => {
    expect(wavPcmCodec([])).toBe("pcm_s16le");
    expect(wavPcmCodec([undefined])).toBe("pcm_s16le");
  });

  it("keeps the widest source when several are mixed", () => {
    expect(wavPcmCodec([MP3, FLAC_24, FLAC_16])).toBe("pcm_s24le");
    expect(wavPcmCodec([FLAC_24, WAV_32])).toBe("pcm_s32le");
    expect(wavPcmCodec([WAV_32, WAV_FLOAT])).toBe("pcm_f32le");
  });
});

describe("convert-audio WAV output (#4969)", () => {
  it.each([
    ["in24.flac", "pcm_s24le", FLAC_24],
    ["in24.aiff", "pcm_s24le", AIFF_24],
    ["in16.flac", "pcm_s16le", FLAC_16],
    ["in.mp3", "pcm_s16le", MP3],
  ])("encodes %s as %s", async (filename, codec, stream) => {
    probeQueue.current = [[stream]];
    const result = await routeFor("convert-audio").processV2(ctxFor({ format: "wav" }, [filename]));
    expect(result.contentType).toBe("audio/wav");
    expect(codecArg()).toBe(codec);
  });

  it("leaves FLAC output to the flac encoder", async () => {
    probeQueue.current = [[FLAC_24]];
    await routeFor("convert-audio").processV2(ctxFor({ format: "flac" }, ["in24.flac"]));
    expect(codecArg()).toBe("flac");
  });
});

describe("extract-audio WAV output (#4969)", () => {
  it("keeps a 24-bit PCM soundtrack at 24 bits", async () => {
    probeQueue.current = [[{ type: "video", codec: "prores" }, audio("pcm_s24le", "s32", 24)]];
    await routeFor("extract-audio").processV2(ctxFor({ format: "wav" }, ["clip.mov"]));
    expect(codecArg()).toBe("pcm_s24le");
  });

  it("writes an AAC soundtrack as 16-bit", async () => {
    probeQueue.current = [[{ type: "video", codec: "h264" }, audio("aac", "fltp")]];
    await routeFor("extract-audio").processV2(ctxFor({ format: "wav" }, ["clip.mp4"]));
    expect(codecArg()).toBe("pcm_s16le");
  });
});

describe("merge-audio WAV output (#4969)", () => {
  it("uses the widest input's depth", async () => {
    probeQueue.current = [[MP3], [FLAC_24]];
    await routeFor("merge-audio").processV2(ctxFor({ format: "wav" }, ["a.mp3", "b.flac"]));
    expect(codecArg()).toBe("pcm_s24le");
  });

  it("stays 16-bit for 16-bit inputs", async () => {
    probeQueue.current = [[FLAC_16], [MP3]];
    await routeFor("merge-audio").processV2(ctxFor({ format: "wav" }, ["a.flac", "b.mp3"]));
    expect(codecArg()).toBe("pcm_s16le");
  });
});
