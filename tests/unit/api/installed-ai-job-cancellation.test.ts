import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeMedia, runFfmpeg } from "@snapotter/media-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";

const aiMocks = vi.hoisted(() => ({
  removeBackground: vi.fn(),
  transcribeAudio: vi.fn(),
}));
const mediaMocks = vi.hoisted(() => ({
  probeMedia: vi.fn(),
  runFfmpeg: vi.fn(),
}));

vi.mock("@snapotter/ai", () => aiMocks);
vi.mock("@snapotter/media-engine", () => mediaMocks);

import { removeBackground, transcribeAudio } from "@snapotter/ai";
import "../../../apps/api/src/routes/tools/auto-subtitles.js";
import "../../../apps/api/src/routes/tools/background-replace.js";
import "../../../apps/api/src/routes/tools/blur-background.js";
import "../../../apps/api/src/routes/tools/transcribe-audio.js";

const INPUT = Buffer.from("fixture bytes");
const STOP = new Error("stop after dependency capture");

function job(toolId: string, settings: unknown, filename: string): ToolJobData {
  return {
    jobId: `job-${toolId}`,
    toolId,
    userId: null,
    pool: "ai",
    inputRefs: [`uploads/job-${toolId}/${filename}`],
    filename,
    settings,
    kind: "ai-tool",
  };
}

describe("installed AI job cancellation propagation", () => {
  let scratchDir: string;
  let controller: AbortController;
  let ctx: ToolProcessCtx;

  beforeEach(async () => {
    vi.clearAllMocks();
    scratchDir = await mkdtemp(join(tmpdir(), "snapotter-installed-ai-cancel-"));
    controller = new AbortController();
    ctx = { signal: controller.signal, scratchDir, report: vi.fn() };
    vi.mocked(probeMedia).mockResolvedValue({
      container: "mov,mp4",
      durationS: 7,
      bitrateKbps: 64,
      streams: [{ type: "audio", codec: "aac" }],
    });
    vi.mocked(runFfmpeg).mockResolvedValue("");
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("passes ctx.signal from transcribe-audio to the transcription package", async () => {
    vi.mocked(transcribeAudio).mockRejectedValue(STOP);

    await expect(
      runAiToolJob(
        job("transcribe-audio", { language: "auto", outputFormat: "txt" }, "speech.wav"),
        INPUT,
        ctx,
      ),
    ).rejects.toBe(STOP);

    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.stringContaining("speech.wav"),
      { language: "auto", signal: controller.signal },
      expect.any(Function),
    );
  });

  it("passes ctx.signal through every auto-subtitles subprocess boundary", async () => {
    vi.mocked(transcribeAudio).mockRejectedValue(STOP);

    await expect(
      runAiToolJob(
        job("auto-subtitles", { language: "auto", format: "srt" }, "speech.mp4"),
        INPUT,
        ctx,
      ),
    ).rejects.toBe(STOP);

    expect(probeMedia).toHaveBeenCalledWith(expect.stringContaining("speech.mp4"), {
      signal: controller.signal,
    });
    expect(runFfmpeg).toHaveBeenCalledWith(
      expect.arrayContaining(["-i", expect.stringContaining("speech.mp4")]),
      { timeoutMs: 10 * 60_000, signal: controller.signal },
    );
    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.stringContaining("audio-16k.wav"),
      { language: "auto", signal: controller.signal },
      expect.any(Function),
    );
  });

  it.each([
    ["blur-background", { intensity: 75, feather: 3, format: "webp" }],
    ["background-replace", { color: "#ff0000" }],
  ])("passes ctx.signal from %s to background removal", async (toolId, settings) => {
    vi.mocked(removeBackground).mockRejectedValue(STOP);

    await expect(runAiToolJob(job(toolId, settings, "portrait.jpg"), INPUT, ctx)).rejects.toBe(
      STOP,
    );

    expect(removeBackground).toHaveBeenCalledWith(
      INPUT,
      scratchDir,
      { signal: controller.signal },
      expect.any(Function),
    );
  });
});
