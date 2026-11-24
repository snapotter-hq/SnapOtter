import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, runFfmpeg } from "@snapotter/media-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtures } from "../../fixtures/index.js";

const aiMocks = vi.hoisted(() => ({ transcribeAudio: vi.fn() }));

vi.mock("@snapotter/ai", () => aiMocks);
vi.mock("@snapotter/media-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/media-engine")>();
  return { ...actual, runFfmpeg: vi.fn(actual.runFfmpeg) };
});

import { transcribeAudio } from "@snapotter/ai";
import "../../../apps/api/src/routes/tools/transcribe-audio.js";

const TRANSCRIPT = {
  text: "hello",
  language: "en",
  segments: [{ startS: 0, endS: 1, text: "hello" }],
};

function job(filename: string): ToolJobData {
  return {
    jobId: "job-transcribe",
    toolId: "transcribe-audio",
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-transcribe/${filename}`],
    filename,
    settings: { language: "auto", outputFormat: "txt" },
    kind: "ai-tool",
  };
}

// faster-whisper decodes with PyAV, which rejects some files the ffmpeg CLI
// plays fine (#4980), so the handler must hand it a WAV that ffmpeg wrote.
describe("transcribe-audio decodes the upload with ffmpeg first", () => {
  let scratchDir: string;
  let ctx: ToolProcessCtx;

  beforeEach(async () => {
    vi.clearAllMocks();
    scratchDir = await mkdtemp(join(tmpdir(), "snapotter-transcribe-wav-"));
    ctx = { signal: new AbortController().signal, scratchDir, report: vi.fn() };
    vi.mocked(transcribeAudio).mockResolvedValue(TRANSCRIPT);
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("transcribes a 16 kHz mono WAV in the job scratch dir, not the upload", async () => {
    vi.mocked(runFfmpeg).mockResolvedValueOnce("");
    const audioDir = join(scratchDir, "audio");
    const uploadPath = join(audioDir, "speech.ogg");
    const wavPath = join(scratchDir, "audio-16k.wav");

    const result = await runAiToolJob(job("speech.ogg"), Buffer.from("ogg bytes"), ctx);

    expect(runFfmpeg).toHaveBeenCalledWith(
      ["-i", uploadPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath],
      { timeoutMs: 10 * 60_000, signal: ctx.signal },
    );
    expect(transcribeAudio).toHaveBeenCalledWith(
      wavPath,
      { language: "auto", signal: ctx.signal, toolId: "transcribe-audio" },
      expect.any(Function),
    );
    expect(result.filename).toBe("speech.txt");
  });

  it("never writes the WAV over an upload that is itself named audio-16k.wav", async () => {
    vi.mocked(runFfmpeg).mockResolvedValueOnce("");

    await runAiToolJob(job("audio-16k.wav"), Buffer.from("wav bytes"), ctx);

    const args = vi.mocked(runFfmpeg).mock.calls[0]?.[0] ?? [];
    const inputPath = args[args.indexOf("-i") + 1];
    expect(inputPath).toBe(join(scratchDir, "audio", "audio-16k.wav"));
    expect(args.at(-1)).not.toBe(inputPath);
  });

  it("does not transcribe when the ffmpeg conversion fails", async () => {
    const failure = new Error("ffmpeg exited with code 1");
    vi.mocked(runFfmpeg).mockRejectedValueOnce(failure);

    await expect(runAiToolJob(job("speech.ogg"), Buffer.from("not audio"), ctx)).rejects.toBe(
      failure,
    );
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it.skipIf(!ffmpegAvailable())(
    "turns an Ogg with a zero-length Vorbis packet into a WAV whisper can read",
    async () => {
      const input = await readFile(fixtures.audio.zeroLengthPacketOgg);

      await runAiToolJob(job("speech-zero-length-packet.ogg"), input, ctx);

      const wavPath = vi.mocked(transcribeAudio).mock.calls[0]?.[0] as string;
      const wav = await readFile(wavPath);
      expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(wav.readUInt32LE(24)).toBe(16_000);
      expect(wav.length).toBeGreaterThan(16_000 * 2 * 5);
    },
  );
});
