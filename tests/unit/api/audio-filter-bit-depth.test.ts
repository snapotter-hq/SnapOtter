import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStreamInfo } from "../../../packages/media-engine/src/index.js";

/**
 * The audio filter tools keep the source container but used to encode WAV as
 * pcm_s16le and AIFF as pcm_s16be no matter what came in, so a 24-bit source
 * came back 16-bit (#5123). They now pick the PCM codec from the probed stream.
 *
 * Same harness as wav-bit-depth.test.ts: the factory records each route's
 * config, and probeMedia and runFfmpeg are replaced since CI has no ffmpeg
 * (volume-adjust's integration test covers the real binary).
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

const routes = await Promise.all([
  import("../../../apps/api/src/routes/tools/audio-channels.js").then(
    (m) => m.registerAudioChannels,
  ),
  import("../../../apps/api/src/routes/tools/audio-speed.js").then((m) => m.registerAudioSpeed),
  import("../../../apps/api/src/routes/tools/fade-audio.js").then((m) => m.registerFadeAudio),
  import("../../../apps/api/src/routes/tools/noise-reduction.js").then(
    (m) => m.registerNoiseReduction,
  ),
  import("../../../apps/api/src/routes/tools/normalize-audio.js").then(
    (m) => m.registerNormalizeAudio,
  ),
  import("../../../apps/api/src/routes/tools/pitch-shift.js").then((m) => m.registerPitchShift),
  import("../../../apps/api/src/routes/tools/reverse-audio.js").then((m) => m.registerReverseAudio),
  import("../../../apps/api/src/routes/tools/silence-removal.js").then(
    (m) => m.registerSilenceRemoval,
  ),
  import("../../../apps/api/src/routes/tools/volume-adjust.js").then((m) => m.registerVolumeAdjust),
]);
for (const register of routes) register({} as never);

/** Settings each route accepts; audio-channels has no default mode. */
const SETTINGS: Record<string, Record<string, unknown>> = {
  "audio-channels": { mode: "mono-to-stereo" },
};
const TOOL_IDS = [
  "audio-channels",
  "audio-speed",
  "fade-audio",
  "noise-reduction",
  "normalize-audio",
  "pitch-shift",
  "reverse-audio",
  "silence-removal",
  "volume-adjust",
];

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
  channels: 1,
});

// What ffprobe reports for each source, measured with ffmpeg 8.
const WAV_16 = audio("pcm_s16le", "s16", 16);
const WAV_24 = audio("pcm_s24le", "s32", 24);
const WAV_FLOAT = audio("pcm_f32le", "flt", 32);
const AIFF_16 = audio("pcm_s16be", "s16", 16);
const AIFF_24 = audio("pcm_s24be", "s32", 24);
const AIFF_32 = audio("pcm_s32be", "s32", 32);
const AIFF_FLOAT = audio("pcm_f32be", "flt", 32);

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "audio-filter-bit-depth-unit-"));
  runFfmpeg.mockClear();
  probeQueue.current = [];
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

function ctxFor(toolId: string, filename: string) {
  return {
    inputs: [{ buffer: Buffer.from("audio"), filename, ref: "r" }],
    settings: SETTINGS[toolId] ?? {},
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

const CASES: Array<[string, string, string, MediaStreamInfo | undefined]> = [
  ["in24.wav", "pcm_s24le", "audio/wav", WAV_24],
  ["in16.wav", "pcm_s16le", "audio/wav", WAV_16],
  ["inf.wav", "pcm_f32le", "audio/wav", WAV_FLOAT],
  ["in24.aiff", "pcm_s24be", "audio/aiff", AIFF_24],
  ["in32.aiff", "pcm_s32be", "audio/aiff", AIFF_32],
  ["inf.aiff", "pcm_f32be", "audio/aiff", AIFF_FLOAT],
  ["in16.aiff", "pcm_s16be", "audio/aiff", AIFF_16],
  ["unprobed.wav", "pcm_s16le", "audio/wav", undefined],
];

describe.each(TOOL_IDS)("%s keeps the source PCM depth (#5123)", (toolId) => {
  it.each(CASES)("encodes %s as %s", async (filename, codec, contentType, stream) => {
    probeQueue.current = [stream ? [stream] : []];
    const result = await routeFor(toolId).processV2(ctxFor(toolId, filename));
    expect(result.contentType).toBe(contentType);
    expect(codecArg()).toBe(codec);
  });
});
