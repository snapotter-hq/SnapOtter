/**
 * auto-subtitles and transcribe-audio are hand-written routes, so they must run
 * the same media ingress checks createToolRoute gives every other media tool:
 * ffprobe validation, the stream-type checks, and the operator's duration and
 * bitrate caps, all before a job is enqueued (#4290).
 */
import type { MediaInfo } from "@snapotter/media-engine";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";

const mocks = vi.hoisted(() => ({
  cancelSingleJobGuarded: vi.fn(),
  deletePrefix: vi.fn(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  insertToolJobAlias: vi.fn(),
  isStorageServiceFault: vi.fn(() => false),
  isToolInstalled: vi.fn(() => true),
  probeMedia: vi.fn(),
  receiveUpload: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@snapotter/media-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/media-engine")>()),
  probeMedia: mocks.probeMedia,
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
  },
  schema: { jobs: { id: {}, status: {}, error: {} } },
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  insertToolJobAlias: mocks.insertToolJobAlias,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: mocks.cancelSingleJobGuarded,
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: mocks.isToolInstalled,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  deletePrefix: mocks.deletePrefix,
  getObjectBuffer: mocks.getObjectBuffer,
  isStorageServiceFault: mocks.isStorageServiceFault,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>()),
  reportError: mocks.reportError,
}));

import { registerAutoSubtitles } from "../../../apps/api/src/routes/tools/auto-subtitles.js";
import { registerTranscribeAudio } from "../../../apps/api/src/routes/tools/transcribe-audio.js";

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
const handlers: Record<string, RouteHandler> = {};

const fakeApp = {
  post: vi.fn((path: string, handler: RouteHandler) => {
    handlers[path] = handler;
  }),
} as unknown as Parameters<typeof registerAutoSubtitles>[0];

const AUTO_SUBTITLES = "/api/v1/tools/video/auto-subtitles";
const TRANSCRIBE = "/api/v1/tools/audio/transcribe-audio";

const VIDEO_INFO: MediaInfo = {
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  durationS: 120,
  bitrateKbps: 2_000,
  streams: [
    { type: "video", codec: "h264", width: 640, height: 360 },
    { type: "audio", codec: "aac", sampleRate: 44_100, channels: 2 },
  ],
};

const AUDIO_INFO: MediaInfo = {
  container: "wav",
  durationS: 120,
  bitrateKbps: 256,
  streams: [{ type: "audio", codec: "pcm_s16le", sampleRate: 16_000, channels: 1 }],
};

const STILL_IMAGE_INFO: MediaInfo = {
  container: "png_pipe",
  durationS: null,
  bitrateKbps: null,
  streams: [{ type: "video", codec: "png", width: 10, height: 10 }],
};

const CAP_KEYS = [
  "MAX_VIDEO_DURATION_S",
  "MAX_AUDIO_DURATION_S",
  "MAX_VIDEO_BITRATE_KBPS",
] as const;
const mutableEnv = env as unknown as Record<(typeof CAP_KEYS)[number], number>;
const originalCaps = Object.fromEntries(CAP_KEYS.map((k) => [k, mutableEnv[k]]));

function makeReply() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function makeRequest(filename: string) {
  const partsList = [
    { type: "file", fieldname: "file", filename, file: {} },
    { type: "field", fieldname: "settings", value: "{}" },
  ];
  return {
    headers: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      for (const p of partsList) yield p;
    },
  };
}

async function post(path: string, filename: string) {
  const reply = makeReply();
  await handlers[path](makeRequest(filename), reply);
  const jobId = mocks.receiveUpload.mock.calls.at(-1)?.[1] as string;
  return { reply, jobId };
}

beforeAll(() => {
  registerAutoSubtitles(fakeApp);
  registerTranscribeAudio(fakeApp);
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of CAP_KEYS) mutableEnv[k] = 0;
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.isStorageServiceFault.mockReturnValue(false);
  mocks.deletePrefix.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue({});
  mocks.insertToolJobAlias.mockResolvedValue(true);
  mocks.getObjectBuffer.mockResolvedValue(Buffer.from("staged upload bytes"));
  mocks.receiveUpload.mockImplementation((part: { filename: string }, jobId: string) =>
    Promise.resolve({
      key: `uploads/${jobId}/${part.filename}`,
      filename: part.filename,
      size: 19,
    }),
  );
});

afterEach(() => {
  for (const k of CAP_KEYS) mutableEnv[k] = originalCaps[k];
});

describe("AI media routes run media ingress validation before enqueue (#4290)", () => {
  it.each([
    [AUTO_SUBTITLES, "notes.mp4"],
    [TRANSCRIBE, "notes.wav"],
  ])(
    "%s rejects a file ffprobe cannot parse with 400 and discards the upload",
    async (path, name) => {
      mocks.probeMedia.mockRejectedValue(new Error("Invalid data found when processing input"));

      const { reply, jobId } = await post(path, name);

      expect(reply.statusCode).toBe(400);
      expect((reply.payload as { error: string }).error).toMatch(
        /^Unrecognized (video|audio) file/,
      );
      expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
      expect(mocks.getObjectBuffer).toHaveBeenCalledWith(`uploads/${jobId}/${name}`);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${jobId}/`);
    },
  );

  it("auto-subtitles enforces MAX_VIDEO_DURATION_S", async () => {
    mutableEnv.MAX_VIDEO_DURATION_S = 60;
    mocks.probeMedia.mockResolvedValue(VIDEO_INFO);

    const { reply, jobId } = await post(AUTO_SUBTITLES, "talk.mp4");

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({ error: "Duration 120s exceeds the maximum of 60s" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${jobId}/`);
  });

  it("auto-subtitles enforces MAX_VIDEO_BITRATE_KBPS", async () => {
    mutableEnv.MAX_VIDEO_BITRATE_KBPS = 1_000;
    mocks.probeMedia.mockResolvedValue(VIDEO_INFO);

    const { reply } = await post(AUTO_SUBTITLES, "talk.mp4");

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({ error: "Bitrate 2000kbps exceeds the maximum of 1000kbps" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("auto-subtitles rejects a still image and an audio-only file", async () => {
    mocks.probeMedia.mockResolvedValueOnce(STILL_IMAGE_INFO);
    const still = await post(AUTO_SUBTITLES, "frame.mp4");
    expect(still.reply.statusCode).toBe(400);
    expect(still.reply.payload).toEqual({ error: "File is a still image, not a video" });

    mocks.probeMedia.mockResolvedValueOnce(AUDIO_INFO);
    const audioOnly = await post(AUTO_SUBTITLES, "song.mp4");
    expect(audioOnly.reply.statusCode).toBe(400);
    expect((audioOnly.reply.payload as { error: string }).error).toMatch(/no video track/);

    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("transcribe-audio enforces MAX_AUDIO_DURATION_S", async () => {
    mutableEnv.MAX_AUDIO_DURATION_S = 30;
    mocks.probeMedia.mockResolvedValue(AUDIO_INFO);

    const { reply, jobId } = await post(TRANSCRIBE, "call.wav");

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({ error: "Duration 120s exceeds the maximum of 30s" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${jobId}/`);
  });

  it("transcribe-audio rejects a file with no audio stream", async () => {
    mocks.probeMedia.mockResolvedValue({
      ...VIDEO_INFO,
      streams: VIDEO_INFO.streams.filter((s) => s.type === "video"),
    });

    const { reply } = await post(TRANSCRIBE, "silent.mp4");

    expect(reply.statusCode).toBe(400);
    expect((reply.payload as { error: string }).error).toMatch(/no audio track/);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it.each([
    [AUTO_SUBTITLES, "talk.mp4"],
    [TRANSCRIBE, "call.wav"],
  ])("%s answers 503 ENGINE_UNAVAILABLE when ffprobe cannot start", async (path, name) => {
    mocks.probeMedia.mockRejectedValue(new Error("ffprobe binary not found"));

    const { reply } = await post(path, name);

    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it.each([
    [AUTO_SUBTITLES, "talk.mp4", VIDEO_INFO],
    [TRANSCRIBE, "call.wav", AUDIO_INFO],
  ])("%s still enqueues a valid file that is within the caps", async (path, name, info) => {
    mutableEnv.MAX_VIDEO_DURATION_S = 600;
    mutableEnv.MAX_AUDIO_DURATION_S = 600;
    mutableEnv.MAX_VIDEO_BITRATE_KBPS = 10_000;
    mocks.probeMedia.mockResolvedValue(info);

    const { reply, jobId } = await post(path, name);

    expect(reply.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      jobId,
      inputRefs: [`uploads/${jobId}/${name}`],
      filename: name,
      pool: "ai",
    });
    expect(mocks.deletePrefix).not.toHaveBeenCalled();
  });
});
