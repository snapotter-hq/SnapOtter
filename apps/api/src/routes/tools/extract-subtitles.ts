import { join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import { hasServerErrorStatus, isSafeMessageError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isBinarySpawnFailure } from "../../lib/binary-overrides.js";
import { isOperationalErrno } from "../../lib/error-report.js";
import { runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

const MISSING_SUBTITLE_STREAM_RE =
  /Stream map '(?:0:s:0)?' matches no streams|does not contain any stream/i;
const BITMAP_SUBTITLE_STREAM_RE =
  /Subtitle encoding currently only possible from text to text or bitmap to bitmap/i;

export function registerExtractSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "extract-subtitles",
    settingsSchema,
    process: async () => {
      throw new Error("extract-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.srt`;

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      const outPath = join(ctx.scratchDir, "media", outName);

      try {
        await runFfmpegWithProgress(ctx, ["-i", inPath, "-map", "0:s:0", outPath], info.durationS);
      } catch (err) {
        // A canceled job or engine/operational fault must not masquerade as a missing subtitle track
        if (
          ctx.signal.aborted ||
          isBinarySpawnFailure(err) ||
          isSafeMessageError(err) ||
          hasServerErrorStatus(err) ||
          isOperationalErrno(err)
        ) {
          throw err;
        }
        const message = err instanceof Error ? err.message : "";
        if (BITMAP_SUBTITLE_STREAM_RE.test(message)) {
          throw new InputValidationError(
            "Image-based subtitle tracks cannot be converted to SRT without OCR",
            422,
          );
        }
        if (MISSING_SUBTITLE_STREAM_RE.test(message)) {
          throw new InputValidationError("No subtitle track found in this video");
        }
        throw err;
      }

      return {
        scratchPath: outPath,
        filename: outName,
        contentType: "application/x-subrip",
      };
    },
  });
}
