import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerVideoMetadata(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-metadata",
    settingsSchema,
    process: async () => {
      throw new Error("video-metadata is v2-only");
    },
    processV2: async (ctx) => {
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_clean${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        ["-i", inPath, "-map", "0", "-map_metadata", "-1", "-c", "copy", outPath],
        info.durationS,
      );

      return {
        scratchPath: outPath,
        filename: outName,
        contentType,
        resultPayload: {
          metadata: {
            container: info.container,
            durationS: info.durationS,
            bitrateKbps: info.bitrateKbps,
            streams: info.streams,
          },
        },
      };
    },
  });
}
