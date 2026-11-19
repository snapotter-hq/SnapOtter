import { softwareEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { avifCrf } from "../../lib/animated-avif.js";
import { formatFfmpegSeconds, runMediaTool } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

// AV1 is slow on a CPU, so the clip is capped the way video-to-gif caps it.
const settingsSchema = z.object({
  fps: z.number().int().min(1).max(30).default(12),
  width: z.number().int().min(64).max(1280).default(480),
  startS: z.number().finite().min(0).default(0),
  durationS: z.number().positive().max(60).default(5),
  quality: z.number().int().min(1).max(100).default(50),
  loop: z.boolean().default(true),
});

export function registerVideoToAvif(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-to-avif",
    settingsSchema,
    process: async () => {
      throw new Error("video-to-avif is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.avif`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out, info) => {
        if (settings.startS >= (info.durationS ?? Infinity)) {
          throw new InputValidationError("Start is beyond the end of the video");
        }
        // Output-side -ss/-t, as in video-to-gif: input-side seeking needs a
        // keyframe index that FLV and other legacy containers often lack.
        // Software only: -preset 8 is libsvtav1's numeric speed preset, which
        // av1_nvenc would reject.
        return [
          "-fflags",
          "+genpts",
          "-i",
          inPath,
          "-ss",
          formatFfmpegSeconds(settings.startS),
          "-t",
          formatFfmpegSeconds(settings.durationS),
          "-vf",
          `fps=${settings.fps},scale=${settings.width}:-2:flags=lanczos,format=yuv420p`,
          "-c:v",
          softwareEncoder("av1"),
          "-crf",
          String(avifCrf(settings.quality)),
          "-preset",
          "8",
          "-loop",
          settings.loop ? "0" : "1",
          "-an",
          "-f",
          "avif",
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType: "image/avif" };
    },
  });
}
