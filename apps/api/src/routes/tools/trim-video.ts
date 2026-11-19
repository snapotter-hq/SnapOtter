import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import {
  audioEncodeArgsForContainer,
  formatFfmpegSeconds,
  runFfmpegWithProgress,
  stageMediaInputs,
  videoContentType,
  videoEncodeArgsForContainer,
} from "../../lib/media-tool.js";
import {
  canEncodeHead,
  planSmartCut,
  probeSmartCutSource,
  probeVideoPackets,
  runSmartCut,
  smartCutContainerSupported,
} from "../../lib/smart-cut.js";
import { InputValidationError } from "../../modality/contract.js";
import type { ToolProcessCtxV2 } from "../tool-factory.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    startS: z.number().finite().min(0).default(0),
    endS: z.number().finite().min(0.000001),
    precise: z.boolean().default(false),
  })
  .refine((s) => s.endS > s.startS, { message: "End must be after start" });

interface Cut {
  inPath: string;
  outPath: string;
  ext: string;
  startS: number;
  endS: number;
}

/**
 * Fast mode: copy from a keyframe, re-encoding only the frames before it.
 * Returns false when no copy is safe, so the caller re-encodes the range.
 */
async function trySmartCut(ctx: ToolProcessCtxV2, cut: Cut): Promise<boolean> {
  if (!smartCutContainerSupported(cut.ext)) return false;
  try {
    const source = await probeSmartCutSource(cut.inPath, ctx.signal);
    if (!source) return false;
    const packets = await probeVideoPackets(cut.inPath, source, cut.startS, cut.endS, ctx.signal);
    const plan = planSmartCut(packets, cut.startS, cut.endS, canEncodeHead(source, cut.ext));
    if (plan.kind === "reencode") return false;
    await runSmartCut(ctx, { ...cut, source, plan });
    return true;
  } catch (err) {
    if (ctx.signal.aborted) throw err;
    // The re-encode reads the same file with fewer moving parts, so a
    // smart-cut failure on an odd stream still gets the user their clip.
    logger.warn({ err, ext: cut.ext }, "trim-video smart cut failed, re-encoding the range");
    return false;
  }
}

export function registerTrimVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "trim-video",
    settingsSchema,
    process: async () => {
      throw new Error("trim-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_trimmed${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath, { signal: ctx.signal });
      if (info.durationS === null) {
        throw new InputValidationError("Could not determine video duration");
      }
      if (settings.startS >= info.durationS) {
        throw new InputValidationError("Start is beyond the end of the video");
      }
      const cut: Cut = {
        inPath,
        outPath: join(ctx.scratchDir, "media", outName),
        ext: origExt,
        startS: settings.startS,
        endS: Math.min(settings.endS, info.durationS),
      };

      if (settings.precise || !(await trySmartCut(ctx, cut))) {
        await runFfmpegWithProgress(
          ctx,
          [
            "-i",
            cut.inPath,
            "-ss",
            formatFfmpegSeconds(cut.startS),
            "-to",
            formatFfmpegSeconds(cut.endS),
            ...videoEncodeArgsForContainer(origExt),
            ...audioEncodeArgsForContainer(origExt),
            cut.outPath,
          ],
          cut.endS - cut.startS,
        );
      }
      return { scratchPath: cut.outPath, filename: outName, contentType };
    },
  });
}
