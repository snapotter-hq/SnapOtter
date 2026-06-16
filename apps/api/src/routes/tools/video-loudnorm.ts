import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  audioEncodeArgsForContainer,
  runFfmpegWithProgress,
  stageMediaInputs,
  videoContentType,
} from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerVideoLoudnorm(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-loudnorm",
    settingsSchema,
    process: async () => {
      throw new Error("video-loudnorm is v2-only");
    },
    processV2: async (ctx) => {
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_loudnorm${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      if (!info.streams.some((s) => s.type === "audio")) {
        throw new InputValidationError("This video has no audio track to normalize");
      }

      const outPath = join(ctx.scratchDir, "media", outName);

      // loudnorm runs internally at 192 kHz and emits at 192 kHz unless we
      // resample back, so restore the source rate to avoid inflating the audio.
      const sr = info.streams.find((s) => s.type === "audio")?.sampleRate ?? 48000;

      const args = [
        "-i",
        inPath,
        "-af",
        `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${sr}`,
        "-c:v",
        "copy",
        ...audioEncodeArgsForContainer(origExt),
        outPath,
      ];

      await runFfmpegWithProgress(ctx, args, info.durationS);

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
