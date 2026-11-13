/**
 * auto-subtitles and transcribe-audio run real ffprobe ingress checks and the
 * operator duration caps before enqueueing (#4290). The bundle gate and the
 * queue are mocked so this runs without the transcription bundle; ffprobe is
 * real, so the suite skips where ffmpeg is absent (CI integration shards).
 */
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const mocks = vi.hoisted(() => ({ enqueueToolJob: vi.fn() }));

vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>()),
  isToolInstalled: () => true,
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>()),
  enqueueToolJob: mocks.enqueueToolJob,
}));

const SPEECH_WAV = readFixture(fixtures.audio.speech.wav);
const SPEECH_MP4 = readFixture(fixtures.video.speech.mp4);
const NOT_MEDIA = Buffer.from("this is a plain text file, not media\n".repeat(64));

const mutableEnv = env as unknown as Record<string, number>;
const originalVideoCap = env.MAX_VIDEO_DURATION_S;
const originalAudioCap = env.MAX_AUDIO_DURATION_S;

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

async function post(
  tool: "video/auto-subtitles" | "audio/transcribe-audio",
  filename: string,
  content: Buffer,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: "{}" },
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/${tool}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("AI media route ingress with real ffprobe (#4290)", () => {
  beforeAll(async () => {
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    mocks.enqueueToolJob.mockReset().mockResolvedValue({});
    mutableEnv.MAX_VIDEO_DURATION_S = 0;
    mutableEnv.MAX_AUDIO_DURATION_S = 0;
  });

  afterEach(() => {
    mutableEnv.MAX_VIDEO_DURATION_S = originalVideoCap;
    mutableEnv.MAX_AUDIO_DURATION_S = originalAudioCap;
  });

  it("auto-subtitles rejects a non-media file with 400 before enqueueing", async () => {
    const res = await post("video/auto-subtitles", "notes.mp4", NOT_MEDIA);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/^Unrecognized video file/);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("transcribe-audio rejects a non-media file with 400 before enqueueing", async () => {
    const res = await post("audio/transcribe-audio", "notes.wav", NOT_MEDIA);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/^Unrecognized audio file/);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("auto-subtitles honours MAX_VIDEO_DURATION_S", async () => {
    mutableEnv.MAX_VIDEO_DURATION_S = 2;

    const res = await post("video/auto-subtitles", "speech-10s.mp4", SPEECH_MP4);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/exceeds the maximum of 2s/);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("transcribe-audio honours MAX_AUDIO_DURATION_S", async () => {
    mutableEnv.MAX_AUDIO_DURATION_S = 2;

    const res = await post("audio/transcribe-audio", "speech-10s.wav", SPEECH_WAV);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/exceeds the maximum of 2s/);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it.each([
    ["video/auto-subtitles", "speech-10s.mp4", SPEECH_MP4],
    ["audio/transcribe-audio", "speech-10s.wav", SPEECH_WAV],
  ] as const)("%s enqueues a valid file within the caps", async (tool, filename, content) => {
    mutableEnv.MAX_VIDEO_DURATION_S = 60;
    mutableEnv.MAX_AUDIO_DURATION_S = 60;

    const res = await post(tool, filename, content);

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
  });
});
