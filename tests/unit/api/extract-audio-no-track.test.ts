import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * extract-audio (and the mp4-to-mp3 family of presets built on it) takes
 * uploads through the video handler, which never checks for an audio stream.
 * A video-only file reached ffmpeg as "-vn" with nothing left to write, ffmpeg
 * exited 234 ("Output file does not contain any stream"), and the job was
 * retried and reported to Sentry as a bug (NODE-A7) while the client got a
 * generic 422 (#4411). The route now answers with the same no-audio message
 * the audio handler uses.
 *
 * The route is a closure handed to createToolRoute, so the factory just records
 * the config. runMediaTool stays real; probeMedia and runFfmpeg are replaced,
 * since CI has no ffmpeg (the integration test covers the real binary).
 */

type RouteConfig = {
  toolId: string;
  processV2: (ctx: unknown) => Promise<{ filename: string; contentType: string }>;
};

const registered: RouteConfig[] = [];
const probeStreams: { current: Array<{ type: string; sampleRate?: number }> } = { current: [] };

const runFfmpeg = vi.fn(async (_args: string[]) => "");

vi.mock("../../../packages/media-engine/src/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/media-engine/src/index.js")>();
  return {
    ...actual,
    resolveEncoder: vi.fn((kind: string) => (kind === "mp3" ? "libmp3lame" : kind)),
    probeMedia: vi.fn(async () => ({
      durationS: 1,
      streams: probeStreams.current,
    })),
    runFfmpeg: (args: string[]) => runFfmpeg(args),
  };
});

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

const { registerExtractAudio } = await import(
  "../../../apps/api/src/routes/tools/extract-audio.js"
);
const { InputValidationError } = await import("../../../apps/api/src/modality/contract.js");
const { NO_AUDIO_TRACK_MESSAGE } = await import("../../../apps/api/src/modality/media-input.js");
registerExtractAudio({} as never);
const route = registered.find((r) => r.toolId === "extract-audio");
if (!route) throw new Error("extract-audio was not registered");

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "extract-audio-unit-"));
  runFfmpeg.mockClear();
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

function ctxFor(settings: Record<string, unknown>) {
  return {
    inputs: [{ buffer: Buffer.from("video"), filename: "clip.mp4", ref: "r" }],
    settings,
    scratchDir,
    signal: new AbortController().signal,
    report: () => undefined,
  };
}

describe("extract-audio on a video with no audio track (#4411)", () => {
  it.each(["mp3", "wav", "m4a", "ogg"])(
    "rejects %s output as a 400 InputValidationError before ffmpeg runs",
    async (format) => {
      probeStreams.current = [{ type: "video" }];
      let caught: unknown;
      try {
        await route.processV2(ctxFor({ format }));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(InputValidationError);
      expect((caught as InstanceType<typeof InputValidationError>).statusCode).toBe(400);
      expect((caught as Error).message).toBe(NO_AUDIO_TRACK_MESSAGE);
      expect(runFfmpeg).not.toHaveBeenCalled();
    },
  );

  it("still extracts when the video has an audio track", async () => {
    probeStreams.current = [{ type: "video" }, { type: "audio", sampleRate: 44_100 }];
    const result = await route.processV2(ctxFor({ format: "mp3" }));
    expect(result.filename).toBe("clip.mp3");
    expect(result.contentType).toBe("audio/mpeg");
    expect(runFfmpeg).toHaveBeenCalledTimes(1);
    const args = runFfmpeg.mock.calls[0][0];
    expect(args).toContain("-vn");
    expect(args).toContain("libmp3lame");
  });
});
