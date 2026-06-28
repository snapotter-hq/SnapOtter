import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(["mp3", "wav", "m4a", "ogg"]).default("mp3"),
});

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

export function registerExtractAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "extract-audio",
    settingsSchema,
    process: async () => {
      throw new Error("extract-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        switch (settings.format) {
          case "mp3":
            return ["-i", inPath, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", out];
          case "wav":
            return ["-i", inPath, "-vn", "-c:a", "pcm_s16le", out];
          case "m4a":
            return ["-i", inPath, "-vn", "-c:a", "aac", "-b:a", "192k", out];
          case "ogg":
            return ["-i", inPath, "-vn", "-c:a", "libvorbis", "-q:a", "5", out];
          default:
            return ["-i", inPath, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", out];
        }
      });
      return {
        scratchPath: outPath,
        filename: outName,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
