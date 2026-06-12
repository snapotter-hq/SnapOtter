import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["stereo-to-mono", "mono-to-stereo", "swap"]),
});

export function registerAudioChannels(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "audio-channels",
    settingsSchema,
    process: async () => {
      throw new Error("audio-channels is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_channels${out.ext}`;

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const ch = info.streams.find((s) => s.type === "audio")?.channels ?? 0;

      if ((settings.mode === "stereo-to-mono" || settings.mode === "swap") && ch < 2) {
        throw new InputValidationError("This mode needs a stereo input", 422);
      }

      const outPath = join(ctx.scratchDir, "media", outName);
      let args: string[];

      if (settings.mode === "stereo-to-mono") {
        args = ["-i", inPath, "-ac", "1", ...out.encodeArgs, outPath];
      } else if (settings.mode === "mono-to-stereo") {
        args = ["-i", inPath, "-ac", "2", ...out.encodeArgs, outPath];
      } else {
        // swap
        args = ["-i", inPath, "-af", "pan=stereo|c0=c1|c1=c0", ...out.encodeArgs, outPath];
      }

      await runFfmpegWithProgress(ctx, args, info.durationS);
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
