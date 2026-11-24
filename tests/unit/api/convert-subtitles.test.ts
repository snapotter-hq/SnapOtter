import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOLS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runFfmpegWithProgressMock = vi.fn();

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return {
    ...actual,
    runFfmpegWithProgress: (...args: unknown[]) => runFfmpegWithProgressMock(...args),
  };
});

import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig, type ToolProcessCtxV2 } from "../../../apps/api/src/routes/tool-factory.js";
import {
  decodeSubtitleText,
  registerConvertSubtitles,
} from "../../../apps/api/src/routes/tools/convert-subtitles.js";

const SRT = "1\r\n00:00:00,000 --> 00:00:01,000\r\nCafé\r\n";

function createMockApp(): FastifyInstance {
  return { post: vi.fn() } as unknown as FastifyInstance;
}

async function withScratch<T>(fn: (scratchDir: string) => Promise<T>): Promise<T> {
  const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-convert-subs-"));
  try {
    return await fn(scratchDir);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

function createCtx(
  scratchDir: string,
  buffer: Buffer,
  filename: string,
  settings: Record<string, unknown> = {},
): ToolProcessCtxV2 {
  return {
    inputs: [{ buffer, filename, ref: "uploads/job/input" }],
    settings,
    scratchDir,
    signal: new AbortController().signal,
    report: vi.fn(),
  };
}

describe("convert-subtitles catalog entry (#4828)", () => {
  it("accepts every subtitle format and sits with the other subtitle tools", () => {
    const tool = TOOLS.find((t) => t.id === "convert-subtitles");
    expect(tool).toMatchObject({
      modality: "video",
      category: "video-subtitles",
      acceptedInputs: [".srt", ".vtt", ".ass"],
      outputModality: "file",
    });
  });
});

describe("decodeSubtitleText (#4828)", () => {
  it("reads UTF-8 and drops a byte-order mark", () => {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SRT, "utf8")]);
    expect(decodeSubtitleText(bom, "auto")).toBe(SRT);
    expect(decodeSubtitleText(Buffer.from(SRT, "utf8"), "utf-8")).toBe(SRT);
  });

  it("falls back to Windows-1252 when auto meets bytes that are not UTF-8", () => {
    expect(decodeSubtitleText(Buffer.from(SRT, "latin1"), "auto")).toBe(SRT);
  });

  it("decodes an explicitly chosen legacy encoding", () => {
    // "字幕" ("subtitles") in GB18030
    const gb = Buffer.concat([
      Buffer.from("1\n00:00:00,000 --> 00:00:01,000\n", "ascii"),
      Buffer.from([0xd7, 0xd6, 0xc4, 0xbb]),
    ]);
    expect(decodeSubtitleText(gb, "gb18030")).toBe("1\n00:00:00,000 --> 00:00:01,000\n字幕");
  });
});

describe("convert-subtitles route processor (#4828)", () => {
  beforeEach(() => {
    runFfmpegWithProgressMock.mockReset().mockResolvedValue("");
    registerConvertSubtitles(createMockApp());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("re-encodes the input as UTF-8 and asks ffmpeg for the chosen format", async () => {
    const config = getToolConfig("convert-subtitles");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, Buffer.from(SRT, "latin1"), "My Movie.SRT", {
        format: "vtt",
        encoding: "windows-1252",
      });
      const result = await config?.processV2?.(ctx);

      const stagedIn = join(scratchDir, "media", "in-0-My_Movie.srt");
      const expectedOut = join(scratchDir, "media", "My Movie.vtt");

      expect(await readFile(stagedIn, "utf8")).toBe(SRT);
      expect(runFfmpegWithProgressMock).toHaveBeenCalledWith(
        ctx,
        ["-i", stagedIn, expectedOut],
        null,
      );
      expect(result).toEqual({
        scratchPath: expectedOut,
        filename: "My Movie.vtt",
        contentType: "text/vtt",
      });
    });
  });

  it("defaults to SRT output", async () => {
    const config = getToolConfig("convert-subtitles");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, Buffer.from("[Script Info]\n", "utf8"), "episode.ass");
      const result = await config?.processV2?.(ctx);

      expect(result).toMatchObject({
        filename: "episode.srt",
        contentType: "application/x-subrip",
      });
    });
  });

  it("labels ASS output with the SSA media type", async () => {
    const config = getToolConfig("convert-subtitles");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, Buffer.from(SRT, "utf8"), "clip.srt", { format: "ass" });
      const result = await config?.processV2?.(ctx);

      expect(result).toMatchObject({ filename: "clip.ass", contentType: "text/x-ssa" });
    });
  });

  it("maps a subtitle ffmpeg can't parse to a 422", async () => {
    const config = getToolConfig("convert-subtitles");
    runFfmpegWithProgressMock.mockRejectedValueOnce(
      new Error("ffmpeg exited 183: Error opening input: Invalid data found when processing input"),
    );

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, Buffer.from(SRT, "utf8"), "broken.srt");
      const err = await config?.processV2?.(ctx).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InputValidationError);
      expect(err).toMatchObject({ statusCode: 422 });
    });
  });

  it("rethrows ffmpeg failures that aren't about the input", async () => {
    const config = getToolConfig("convert-subtitles");
    const boom = new Error("ffmpeg exited 1: Conversion failed!");
    runFfmpegWithProgressMock.mockRejectedValueOnce(boom);

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, Buffer.from(SRT, "utf8"), "clip.srt");
      await expect(config?.processV2?.(ctx)).rejects.toBe(boom);
    });
  });

  it("rejects an unknown output format at the schema", () => {
    const config = getToolConfig("convert-subtitles");
    expect(config?.settingsSchema.safeParse({ format: "sub" }).success).toBe(false);
    expect(config?.settingsSchema.safeParse({ encoding: "ebcdic" }).success).toBe(false);
  });

  it("declares a single subtitle input so the 1 MiB subtitle cap applies", () => {
    const config = getToolConfig("convert-subtitles");
    expect(config?.inputKinds).toEqual(["subtitle"]);
  });
});
