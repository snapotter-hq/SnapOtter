import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(["mp3", "wav", "ogg", "flac", "m4a"]).default("mp3"),
  bitrateKbps: z.number().int().min(32).max(320).default(192),
});

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

export function registerConvertAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-audio",
    settingsSchema,
    process: async () => {
      throw new Error("convert-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        switch (settings.format) {
          case "mp3":
            return [
              "-i",
              inPath,
              "-vn",
              "-c:a",
              "libmp3lame",
              "-b:a",
              `${settings.bitrateKbps}k`,
              out,
            ];
          case "wav":
            return ["-i", inPath, "-vn", "-c:a", "pcm_s16le", out];
          case "ogg": {
            // libvorbis ABR (-b:a) fails with "encoder setup failed" when the bitrate is
            // too high for the source sample rate (e.g. 8 kHz). Use quality VBR (-q:a),
            // which adapts to the rate. Map bitrate -> quality (~bitrate/32: 192k -> q6).
            const quality = (settings.bitrateKbps / 32).toFixed(1);
            return ["-i", inPath, "-vn", "-c:a", "libvorbis", "-q:a", quality, out];
          }
          case "flac":
            return ["-i", inPath, "-vn", "-c:a", "flac", out];
          case "m4a":
            return ["-i", inPath, "-vn", "-c:a", "aac", "-b:a", `${settings.bitrateKbps}k`, out];
          default:
            return [
              "-i",
              inPath,
              "-vn",
              "-c:a",
              "libmp3lame",
              "-b:a",
              `${settings.bitrateKbps}k`,
              out,
            ];
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
