import { extname, join } from "node:path";
import { probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const TARGETS = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
} as const;
type TargetKey = keyof typeof TARGETS;

/** Output canvas for a source WxH fitted into ratio rw:rh (even dims). */
export function canvasFor(
  w: number,
  h: number,
  rw: number,
  rh: number,
): { cw: number; ch: number } {
  let cw: number;
  let ch: number;
  if (w * rh >= h * rw) {
    cw = w;
    ch = Math.round((w * rh) / rw);
  } else {
    ch = h;
    cw = Math.round((h * rw) / rh);
  }
  cw += cw % 2;
  ch += ch % 2;
  return { cw, ch };
}

const settingsSchema = z.object({
  target: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).default("16:9"),
  blur: z.number().min(2).max(50).default(20),
});

export function registerBlurPad(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "blur-pad",
    settingsSchema,
    process: async () => {
      throw new Error("blur-pad is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_blurpad${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const v = info.streams.find((s) => s.type === "video");
      const srcW = v?.width ?? 0;
      const srcH = v?.height ?? 0;

      const [rw, rh] = TARGETS[settings.target as TargetKey];
      const { cw, ch } = canvasFor(srcW, srcH, rw, rh);

      const filter = `[0:v]split[bg][fg];[bg]scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},gblur=sigma=${settings.blur}[b];[b][fg]overlay=(W-w)/2:(H-h)/2[v]`;

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          inPath,
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-map",
          "0:a?",
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
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
