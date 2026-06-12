import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioContentType, runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  strip: z.boolean().default(false),
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
  album: z.string().max(500).optional(),
});

export function registerAudioMetadata(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "audio-metadata",
    settingsSchema,
    process: async () => {
      throw new Error("audio-metadata is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const srcExt = extname(ctx.inputs[0].filename) || ".mp3";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_metadata${srcExt}`;
      const contentType = audioContentType(srcExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      const args = ["-i", inPath];
      if (settings.strip) {
        args.push("-map_metadata", "-1");
      }
      for (const [key, value] of [
        ["title", settings.title],
        ["artist", settings.artist],
        ["album", settings.album],
      ] as const) {
        if (value !== undefined) {
          args.push("-metadata", `${key}=${value}`);
        }
      }
      args.push("-c", "copy");

      const outPath = join(ctx.scratchDir, "media", outName);
      args.push(outPath);

      await runFfmpegWithProgress(ctx, args, info.durationS);

      return {
        scratchPath: outPath,
        filename: outName,
        contentType,
        resultPayload: {
          metadata: {
            container: info.container,
            durationS: info.durationS,
            bitrateKbps: info.bitrateKbps,
            tags: info.tags ?? {},
          },
        },
      };
    },
  });
}
