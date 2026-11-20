import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { hasServerErrorStatus, isSafeMessageError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isBinarySpawnFailure } from "../../lib/binary-overrides.js";
import { isOperationalErrno } from "../../lib/error-report.js";
import { runFfmpegWithProgress } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

export const SUBTITLE_OUTPUT_FORMATS = ["srt", "vtt", "ass"] as const;

// WHATWG labels TextDecoder understands. Plenty of SRTs in the wild predate UTF-8.
export const SUBTITLE_ENCODINGS = [
  "auto",
  "utf-8",
  "windows-1252",
  "windows-1250",
  "windows-1251",
  "windows-1256",
  "iso-8859-2",
  "gb18030",
  "big5",
  "shift_jis",
  "euc-kr",
] as const;

export type SubtitleEncoding = (typeof SUBTITLE_ENCODINGS)[number];

const CONTENT_TYPES: Record<(typeof SUBTITLE_OUTPUT_FORMATS)[number], string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  ass: "text/x-ssa",
};

// A file that passes the upload sniff (it has a cue arrow) but isn't parseable
const UNPARSEABLE_SUBTITLE_RE = /Invalid data found when processing input/i;

const settingsSchema = z.object({
  format: z.enum(SUBTITLE_OUTPUT_FORMATS).default("srt"),
  encoding: z.enum(SUBTITLE_ENCODINGS).default("auto"),
});

/**
 * Decodes subtitle bytes to text. "auto" takes valid UTF-8 as is and otherwise
 * assumes Windows-1252, the most common legacy SRT encoding; other scripts need
 * the encoding picked explicitly.
 */
export function decodeSubtitleText(raw: Buffer, encoding: SubtitleEncoding): string {
  if (encoding !== "auto") {
    return new TextDecoder(encoding).decode(raw);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder("windows-1252").decode(raw);
  }
}

export function registerConvertSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-subtitles",
    inputKinds: ["subtitle"],
    settingsSchema,
    process: async () => {
      throw new Error("convert-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;

      // ffmpeg's subtitle demuxers expect UTF-8, so transcode before handing it over
      const dir = join(ctx.scratchDir, "media");
      await mkdir(dir, { recursive: true });
      const safeBase = base.replace(/[^A-Za-z0-9._-]/g, "_");
      const inPath = join(dir, `in-0-${safeBase}${extname(input.filename).toLowerCase()}`);
      await writeFile(inPath, decodeSubtitleText(input.buffer, settings.encoding), "utf8");

      const outPath = join(dir, outName);
      try {
        await runFfmpegWithProgress(ctx, ["-i", inPath, outPath], null);
      } catch (err) {
        if (
          ctx.signal.aborted ||
          isBinarySpawnFailure(err) ||
          isSafeMessageError(err) ||
          hasServerErrorStatus(err) ||
          isOperationalErrno(err)
        ) {
          throw err;
        }
        if (err instanceof Error && UNPARSEABLE_SUBTITLE_RE.test(err.message)) {
          throw new InputValidationError("This subtitle file is malformed and can't be read", 422);
        }
        throw err;
      }

      return {
        scratchPath: outPath,
        filename: outName,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
