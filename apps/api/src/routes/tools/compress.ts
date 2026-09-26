import { compressDetailed } from "@snapotter/image-engine";
import { kbToBytes } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { openAnimated, readAnimationFor } from "../../lib/animated-image.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["quality", "targetSize"]).default("quality"),
  quality: z.number().int().min(1).max(100).optional(),
  targetSizeKb: z.number().positive().optional(),
});

type CompressSettings = z.infer<typeof settingsSchema>;

async function runCompress(inputBuffer: Buffer, settings: CompressSettings, filename: string) {
  const outputFormat = await resolveOutputFormat(inputBuffer, filename);
  const animation = await readAnimationFor(inputBuffer, outputFormat.format);
  const image = openAnimated(inputBuffer, animation);

  const compressOptions: {
    quality?: number;
    targetSizeBytes?: number;
    animated?: boolean;
  } = { animated: animation.animated };

  const targetKb = settings.mode === "targetSize" ? settings.targetSizeKb : undefined;
  if (targetKb) {
    compressOptions.targetSizeBytes = kbToBytes(targetKb);
  } else {
    compressOptions.quality = settings.quality ?? 80;
  }

  const result = await compressDetailed(image, compressOptions);
  const buffer = await result.image.toBuffer();
  return {
    buffer,
    filename,
    contentType: outputFormat.contentType,
    resultPayload: targetKb ? { targetKb, resizedTo: result.resizedTo } : undefined,
  };
}

export function registerCompress(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const { buffer, contentType } = await runCompress(inputBuffer, settings, filename);
      return { buffer, filename, contentType };
    },
    // v2 so target-size runs can tell the client whether the image was shrunk to fit.
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      return runCompress(input.buffer, settingsSchema.parse(ctx.settings), input.filename);
    },
  });
}
