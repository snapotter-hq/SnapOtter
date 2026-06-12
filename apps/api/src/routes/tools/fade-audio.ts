import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    fadeInS: z.number().min(0).max(30).default(1),
    fadeOutS: z.number().min(0).max(30).default(1),
  })
  .refine((s) => s.fadeInS > 0 || s.fadeOutS > 0, {
    message: "Set a fade-in or fade-out",
  });

export function registerFadeAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "fade-audio",
    settingsSchema,
    process: async () => {
      throw new Error("fade-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_fade${out.ext}`;

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const d = info.durationS ?? 0;

      if ((d === 0 || info.durationS === null) && settings.fadeOutS > 0) {
        throw new InputValidationError("Could not determine audio duration for fade-out");
      }

      const fin = Math.min(settings.fadeInS, d);
      const fout = Math.min(settings.fadeOutS, d);

      const parts: string[] = [];
      if (fin > 0) {
        parts.push(`afade=t=in:st=0:d=${fin}`);
      }
      if (fout > 0) {
        parts.push(`afade=t=out:st=${Math.max(0, d - fout)}:d=${fout}`);
      }
      const chain = parts.join(",");

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        ["-i", inPath, "-af", chain, ...out.encodeArgs, outPath],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
