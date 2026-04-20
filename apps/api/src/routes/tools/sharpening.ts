import { sharpenAdvanced } from "@ashim/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  method: z.enum(["adaptive", "unsharp-mask", "high-pass"]).default("adaptive"),
  // Adaptive
  sigma: z.number().min(0.5).max(10).default(1.0),
  m1: z.number().min(0).max(10).default(1.0),
  m2: z.number().min(0).max(20).default(3.0),
  x1: z.number().min(0).max(10).default(2.0),
  y2: z.number().min(0).max(50).default(12),
  y3: z.number().min(0).max(50).default(20),
  // Unsharp Mask
  amount: z.number().min(0).max(1000).default(100),
  radius: z.number().min(0.1).max(5).default(1.0),
  threshold: z.number().min(0).max(255).default(0),
  // High-Pass
  strength: z.number().min(0).max(100).default(50),
  kernelSize: z.union([z.literal(3), z.literal(5)]).default(3),
  // Noise reduction
  denoise: z.enum(["off", "light", "medium", "strong"]).default("off"),
});

export function registerSharpening(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "sharpening",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      let image = sharp(inputBuffer);

      image = await sharpenAdvanced(image, {
        method: settings.method,
        sigma: settings.sigma,
        m1: settings.m1,
        m2: settings.m2,
        x1: settings.x1,
        y2: settings.y2,
        y3: settings.y3,
        amount: settings.amount,
        radius: settings.radius,
        threshold: settings.threshold,
        strength: settings.strength,
        kernelSize: settings.kernelSize,
        denoise: settings.denoise,
      });

      const buffer = await image
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
