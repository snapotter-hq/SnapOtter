import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  canvasFor,
  runFfmpegWithProgress,
  stageMediaInputs,
  TARGETS,
  type TargetKey,
  videoContentType,
  videoEncodeArgsForContainer,
} from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  target: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).default("9:16"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
});

export function registerAspectPad(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "aspect-pad",
    settingsSchema,
    process: async () => {
      throw new Error("aspect-pad is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_padded${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const v = info.streams.find((s) => s.type === "video");
      const srcW = v?.width ?? 0;
      const srcH = v?.height ?? 0;

      const [rw, rh] = TARGETS[settings.target as TargetKey];
      const { cw, ch } = canvasFor(srcW, srcH, rw, rh);

      const c = settings.color.replace("#", "0x");

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          inPath,
          "-vf",
          `pad=${cw}:${ch}:(ow-iw)/2:(oh-ih)/2:color=${c}`,
          ...videoEncodeArgsForContainer(origExt),
          "-c:a",
          "copy",
          outPath,
        ],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
