import { basename, extname, join } from "node:path";
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

export function registerReplaceAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "replace-audio",
    maxInputs: 2,
    inputKinds: ["video", "audio"],
    settingsSchema,
    process: async () => {
      throw new Error("replace-audio is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length !== 2) {
        throw new InputValidationError("Provide a video and an audio file");
      }

      const paths = await stageMediaInputs(ctx);
      const videoProbe = await probeMedia(paths[0]);
      const audioProbe = await probeMedia(paths[1]);

      const hasVideo = videoProbe.streams.some((s) => s.type === "video");
      if (!hasVideo) {
        throw new InputValidationError("First file must be a video");
      }

      const hasAudio = audioProbe.streams.some((s) => s.type === "audio");
      if (!hasAudio) {
        throw new InputValidationError("Second file must be an audio file");
      }

      const vcodec = videoProbe.streams.find((s) => s.type === "video")?.codec ?? "";
      const ext = outputExtForCopiedVideo(vcodec);
      const videoBase = basename(ctx.inputs[0].filename, extname(ctx.inputs[0].filename));
      const outName = `${videoBase}_newaudio${ext}`;
      const outPath = join(ctx.scratchDir, "media", outName);

      const args = [
        "-i",
        paths[0],
        "-i",
        paths[1],
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        ...audioEncodeArgsForContainer(ext),
        "-shortest",
        outPath,
      ];

      const totalS = videoProbe.durationS;
      await runFfmpegWithProgress(ctx, args, totalS);

      return {
        scratchPath: outPath,
        filename: outName,
        contentType: videoContentType(ext),
      };
    },
  });
}

function outputExtForCopiedVideo(codec: string): ".mp4" | ".webm" | ".mkv" | ".mpg" {
  if (["mpeg1video", "mpeg2video"].includes(codec)) {
    return ".mpg";
  }

  if (["vp8", "vp9"].includes(codec)) {
    return ".webm";
  }

  if (["h264", "hevc", "mpeg4", "av1"].includes(codec)) {
    return ".mp4";
  }

  return ".mkv";
}
