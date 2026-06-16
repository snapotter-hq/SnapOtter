import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  audioEncodeArgsForContainer,
  runMediaTool,
  videoContentType,
  videoEncodeArgsForContainer,
} from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    startS: z.number().min(0).default(0),
    endS: z.number().positive(),
    precise: z.boolean().default(false),
  })
  .refine((s) => s.endS > s.startS, { message: "End must be after start" });

export function registerTrimVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "trim-video",
    settingsSchema,
    process: async () => {
      throw new Error("trim-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_trimmed${origExt}`;
      const contentType = videoContentType(origExt);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        if (settings.precise) {
          return [
            "-i",
            inPath,
            "-ss",
            String(settings.startS),
            "-to",
            String(settings.endS),
            ...videoEncodeArgsForContainer(origExt),
            ...audioEncodeArgsForContainer(origExt),
            out,
          ];
        }
        // Fast seek: -ss before -i for stream-copy
        return [
          "-ss",
          String(settings.startS),
          "-to",
          String(settings.endS),
          "-i",
          inPath,
          "-c",
          "copy",
          "-avoid_negative_ts",
          "make_zero",
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
