import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerNormalizeAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "normalize-audio",
    settingsSchema,
    process: async () => {
      throw new Error("normalize-audio is v2-only");
    },
    processV2: async (ctx) => {
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_normalized${out.ext}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath, info) => {
        // loudnorm runs internally at 192 kHz and emits at 192 kHz unless we
        // resample back, so restore the source rate to avoid inflating the file.
        const sr = info.audioSampleRate ?? 44100;
        return [
          "-i",
          inPath,
          "-af",
          `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${sr}`,
          ...out.encodeArgs,
          outPath,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
