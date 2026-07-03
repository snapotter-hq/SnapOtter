import { basename, extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  audioEncodeArgsForContainer,
  runFfmpegWithProgress,
  stageMediaInputs,
  videoContentType,
  videoEncodeArgsForContainer,
} from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{3}$/)
    .default("eng"),
});

export function registerEmbedSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "embed-subtitles",
    maxInputs: 2,
    inputKinds: ["video", "subtitle"],
    settingsSchema,
    process: async () => {
      throw new Error("embed-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length !== 2) {
        throw new InputValidationError("Provide a video file and a subtitle file");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const base = basename(ctx.inputs[0].filename, extname(ctx.inputs[0].filename));

      const srcExt = extname(ctx.inputs[0].filename).toLowerCase();
      const toMp4 = [".mp4", ".mov", ".m4v"].includes(srcExt);
      const outExt = toMp4 ? ".mp4" : ".mkv";
      const scodec = toMp4 ? "mov_text" : "srt";
      const reencodeInputStreams = outExt === ".mkv" && [".mpg", ".mpeg"].includes(srcExt);

      const outName = `${base}_subs${outExt}`;
      const contentType = videoContentType(outExt);

      const paths = await stageMediaInputs(ctx);
      const videoPath = paths[0];
      const subPath = paths[1];
      const info = await probeMedia(videoPath);

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-fflags",
          "+genpts",
          "-i",
          videoPath,
          "-i",
          subPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          // The new subtitle is mapped BEFORE the source's existing subtitle
          // tracks so it is always output subtitle stream s:0, which the
          // language tag below targets.
          "-map",
          "1:0",
          // Preserve subtitle tracks already in the source (re-encoded to the
          // container's text codec, matching the old `-map 0` behavior).
          // Data streams stay unmapped on purpose: MPEG data tracks such as
          // teletext cannot be remuxed into mp4/mkv and fail the whole job.
          "-map",
          "0:s?",
          // MKV can carry attachment streams (embedded fonts); MP4 cannot.
          ...(toMp4 ? [] : ["-map", "0:t?"]),
          ...(reencodeInputStreams
            ? [...videoEncodeArgsForContainer(outExt), ...audioEncodeArgsForContainer(outExt)]
            : ["-c:v", "copy", "-c:a", "copy"]),
          "-c:s",
          scodec,
          "-metadata:s:s:0",
          `language=${settings.language}`,
          outPath,
        ],
        info.durationS,
      );

      return {
        scratchPath: outPath,
        filename: outName,
        contentType,
      };
    },
  });
}
