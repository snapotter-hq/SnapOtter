import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SafeError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probeMediaMock = vi.fn();
const runFfmpegWithProgressMock = vi.fn();

vi.mock("@snapotter/media-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/media-engine")>();
  return {
    ...actual,
    probeMedia: (...args: unknown[]) => probeMediaMock(...args),
  };
});

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return {
    ...actual,
    runFfmpegWithProgress: (...args: unknown[]) => runFfmpegWithProgressMock(...args),
  };
});

import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig, type ToolProcessCtxV2 } from "../../../apps/api/src/routes/tool-factory.js";
import { registerExtractSubtitles } from "../../../apps/api/src/routes/tools/extract-subtitles.js";

function createMockApp(): FastifyInstance {
  return {
    post: vi.fn(),
  } as unknown as FastifyInstance;
}

async function withScratch<T>(fn: (scratchDir: string) => Promise<T>): Promise<T> {
  const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-extract-subs-"));
  try {
    return await fn(scratchDir);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

function createCtx(scratchDir: string, filename = "clip.mkv"): ToolProcessCtxV2 {
  return {
    inputs: [{ buffer: Buffer.from("mkv-bytes"), filename, ref: "uploads/job/input" }],
    settings: {},
    scratchDir,
    signal: new AbortController().signal,
    report: vi.fn(),
  };
}

describe("extract-subtitles route processor (#3361)", () => {
  beforeEach(() => {
    probeMediaMock.mockReset().mockResolvedValue({
      container: "matroska,webm",
      durationS: 12.5,
      bitrateKbps: 500,
      streams: [{ type: "video", codec: "h264" }],
    });
    runFfmpegWithProgressMock.mockReset().mockResolvedValue("");
    registerExtractSubtitles(createMockApp());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stages the input, probes duration, runs ffmpeg -map 0:s:0, and returns the .srt output", async () => {
    const config = getToolConfig("extract-subtitles");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "Movie Clip.mkv");
      const result = await config?.processV2?.(ctx);

      const stagedIn = join(scratchDir, "media", "in-0-Movie_Clip.mkv");
      const expectedOut = join(scratchDir, "media", "Movie Clip.srt");

      expect(await readFile(stagedIn)).toEqual(Buffer.from("mkv-bytes"));
      expect(probeMediaMock).toHaveBeenCalledWith(stagedIn);
      expect(runFfmpegWithProgressMock).toHaveBeenCalledWith(
        ctx,
        ["-i", stagedIn, "-map", "0:s:0", expectedOut],
        12.5,
      );
      expect(result).toEqual({
        scratchPath: expectedOut,
        filename: "Movie Clip.srt",
        contentType: "application/x-subrip",
      });
    });
  });

  it.each([
    ["FFmpeg 5/6 stream map", "ffmpeg exited 1: Stream map '0:s:0' matches no streams."],
    [
      "FFmpeg 7/8 empty-token stream map",
      "ffmpeg exited 234: Stream map '' matches no streams.\nFailed to set value '0:s:0' for option 'map': Invalid argument",
    ],
    ["empty output stream", "ffmpeg exited 1: Output file #0 does not contain any stream"],
  ])("maps %s stderr to a 400 InputValidationError", async (_label, message) => {
    const config = getToolConfig("extract-subtitles");
    runFfmpegWithProgressMock.mockRejectedValueOnce(new Error(message));

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir);
      const err = await config?.processV2?.(ctx).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InputValidationError);
      expect(err).toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: "No subtitle track found in this video",
      });
    });
  });

  it("maps a bitmap subtitle encoding failure to a 422 InputValidationError (#3371)", async () => {
    const config = getToolConfig("extract-subtitles");
    runFfmpegWithProgressMock.mockRejectedValueOnce(
      new Error(
        "ffmpeg exited 234: [sost#0:0/srt @ 0x1] Subtitle encoding currently only possible from text to text or bitmap to bitmap",
      ),
    );

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir);
      const err = await config?.processV2?.(ctx).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InputValidationError);
      expect(err).toMatchObject({
        name: "InputValidationError",
        statusCode: 422,
        message: "Image-based subtitle tracks cannot be converted to SRT without OCR",
      });
    });
  });

  it("rethrows when ctx.signal is aborted, even if stderr matches a missing subtitle stream", async () => {
    const config = getToolConfig("extract-subtitles");
    const ac = new AbortController();
    const cancelErr = new Error("ffmpeg exited 1: Output file #0 does not contain any stream");
    runFfmpegWithProgressMock.mockImplementationOnce(async () => {
      ac.abort();
      throw cancelErr;
    });

    await withScratch(async (scratchDir) => {
      const ctx = { ...createCtx(scratchDir), signal: ac.signal };
      await expect(config?.processV2?.(ctx)).rejects.toBe(cancelErr);
    });
  });

  it.each([
    [
      "binary spawn ENOENT",
      Object.assign(new Error("spawn /bad/ffmpeg ENOENT"), {
        code: "ENOENT",
        syscall: "spawn /bad/ffmpeg",
        path: "/bad/ffmpeg",
      }),
    ],
    [
      "binary spawn ENOMEM",
      Object.assign(new Error("spawn /usr/bin/ffmpeg ENOMEM"), {
        code: "ENOMEM",
        syscall: "spawn",
        path: "/usr/bin/ffmpeg",
      }),
    ],
    [
      "SafeError ffmpeg timeout",
      new SafeError("ffmpeg timed out", { kind: "operational", code: "timeout" }),
    ],
    [
      "5xx server error status",
      Object.assign(new Error("Storage unavailable"), { statusCode: 503 }),
    ],
    [
      "operational errno ENOSPC",
      Object.assign(new Error("ENOSPC: no space left on device, write"), {
        code: "ENOSPC",
        syscall: "write",
      }),
    ],
    [
      "missing ffmpeg binary (#3371)",
      new Error("ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)"),
    ],
    [
      "ffmpeg killed by SIGKILL (#3371)",
      Object.assign(new Error("ffmpeg exited SIGKILL: Killed"), { signal: "SIGKILL" }),
    ],
    [
      "memory-limit shell exit 127 (#3371)",
      new Error("ffmpeg exited 127: /bin/sh: 1: ffmpeg: not found"),
    ],
    [
      "non-stream-map ffmpeg write failure (#3371)",
      new Error("ffmpeg exited 1: /scratch/media/clip.srt: No space left on device"),
    ],
    ["non-Error rejection (#3371)", "unexpected string rejection"],
  ])(
    "rethrows %s instead of masking it as a missing subtitle track (#3361, #3371)",
    async (_label, fault) => {
      const config = getToolConfig("extract-subtitles");
      runFfmpegWithProgressMock.mockRejectedValueOnce(fault);

      await withScratch(async (scratchDir) => {
        const ctx = createCtx(scratchDir);
        await expect(config?.processV2?.(ctx)).rejects.toBe(fault);
      });
    },
  );

  it("propagates probeMedia errors without calling runFfmpegWithProgress or masking them as 400", async () => {
    const config = getToolConfig("extract-subtitles");
    const probeErr = new Error("ffprobe timed out after 15s");
    probeMediaMock.mockRejectedValueOnce(probeErr);

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir);
      await expect(config?.processV2?.(ctx)).rejects.toBe(probeErr);
      expect(runFfmpegWithProgressMock).not.toHaveBeenCalled();
    });
  });

  it("keeps the legacy process fn as a v2-only guard that throws", async () => {
    const config = getToolConfig("extract-subtitles");

    await expect(
      config?.process?.(Buffer.from("x"), {}, "clip.mkv", {
        signal: new AbortController().signal,
        scratchDir: "/tmp",
        report: vi.fn(),
      }),
    ).rejects.toThrow("extract-subtitles is v2-only");
  });
});
