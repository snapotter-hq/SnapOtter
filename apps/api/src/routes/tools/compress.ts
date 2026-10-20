import { compressDetailed } from "@snapotter/image-engine";
import { kbToBytes, SafeError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { openAnimated, readAnimationFor } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    mode: z.enum(["quality", "targetSize"]).default("quality"),
    quality: z.number().int().min(1).max(100).optional(),
    targetSizeKb: z.number().positive().optional(),
  })
  .refine((s) => s.mode !== "targetSize" || s.targetSizeKb !== undefined, {
    message: "targetSizeKb is required when mode is targetSize",
    path: ["targetSizeKb"],
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

  let buffer: Buffer;
  let resizedTo: { width: number; height: number } | undefined;
  try {
    const result = await compressDetailed(image, compressOptions);
    buffer = result.buffer ?? (await result.image.toBuffer());
    resizedTo = result.resizedTo;
  } catch (err) {
    throw await asInputErrorIfUndecodable(inputBuffer, err);
  }
  if (
    compressOptions.targetSizeBytes !== undefined &&
    buffer.length > compressOptions.targetSizeBytes
  ) {
    throw new SafeError("Compressed image exceeded target size", {
      kind: "bug",
      code: "TARGET_SIZE_EXCEEDED",
    });
  }
  return {
    buffer,
    filename,
    contentType: outputFormat.contentType,
    resultPayload: targetKb ? { targetKb, resizedTo } : undefined,
  };
}

const guardedCompress = withImageEncodeContext<CompressSettings>(
  "Image compression failed",
  (s) => s?.mode ?? "quality",
  runCompress,
);

export function registerCompress(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const { buffer, contentType } = await guardedCompress(
        inputBuffer,
        settingsSchema.parse(settings),
        filename,
      );
      return { buffer, filename, contentType };
    },
    // v2 so target-size runs can tell the client whether the image was shrunk to fit.
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      return guardedCompress(input.buffer, settingsSchema.parse(ctx.settings), input.filename);
    },
  });
}
