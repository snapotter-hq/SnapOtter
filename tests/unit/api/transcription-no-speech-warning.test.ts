import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A file with no speech is valid input: the job succeeds with an empty
// transcript and a warning that explains it, as blur-faces does for no faces (#4923).

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  probeMedia: vi.fn(),
  runFfmpeg: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock("@snapotter/media-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/media-engine")>()),
  probeMedia: mocks.probeMedia,
  runFfmpeg: mocks.runFfmpeg,
}));

import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { NO_SPEECH_DETECTED_WARNING } from "../../../apps/api/src/lib/empty-result-warnings.js";
import "../../../apps/api/src/routes/tools/auto-subtitles.js";
import "../../../apps/api/src/routes/tools/transcribe-audio.js";

let scratchDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  scratchDir = await mkdtemp(join(tmpdir(), "i4923-"));
  mocks.probeMedia.mockResolvedValue({ streams: [{ type: "audio" }] });
  mocks.runFfmpeg.mockResolvedValue(undefined);
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

function job(toolId: string, filename: string, settings: Record<string, unknown>): ToolJobData {
  return {
    jobId: `${toolId}-job`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/${toolId}-job/${filename}`],
    filename,
    settings,
    kind: "ai-tool",
  };
}

const ctx = () => ({ scratchDir, signal: new AbortController().signal, report: vi.fn() });

const SILENCE = { text: "", language: "en", segments: [] };
const SPEECH = {
  text: "Hello there.",
  language: "en",
  segments: [{ startS: 0, endS: 1.5, text: "Hello there." }],
};

describe.each([
  ["transcribe-audio", "tone.wav", { outputFormat: "txt" }],
  ["transcribe-audio", "tone.wav", { outputFormat: "srt" }],
  ["transcribe-audio", "tone.wav", { outputFormat: "vtt" }],
  ["auto-subtitles", "clip.mp4", { format: "srt" }],
  ["auto-subtitles", "clip.mp4", { format: "vtt" }],
])("%s %o", (toolId, filename, settings) => {
  it("succeeds with a no-speech warning when nothing was transcribed", async () => {
    mocks.transcribeAudio.mockResolvedValue(SILENCE);

    const result = await runAiToolJob(job(toolId, filename, settings), Buffer.from("x"), ctx());

    expect(result.resultPayload).toMatchObject({
      segments: 0,
      warning: NO_SPEECH_DETECTED_WARNING,
    });
  });

  it("carries no warning when speech was transcribed", async () => {
    mocks.transcribeAudio.mockResolvedValue(SPEECH);

    const result = await runAiToolJob(job(toolId, filename, settings), Buffer.from("x"), ctx());

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.resultPayload).toMatchObject({ segments: 1 });
    expect(result.resultPayload).not.toHaveProperty("warning");
  });
});
