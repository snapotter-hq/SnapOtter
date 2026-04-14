import { analyzeImage, applyCorrections } from "@ashim/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["auto", "portrait", "landscape", "low-light", "food", "document"]).default("auto"),
  intensity: z.number().min(0).max(100).default(50),
  corrections: z
    .object({
      exposure: z.boolean().default(true),
      contrast: z.boolean().default(true),
      whiteBalance: z.boolean().default(true),
      saturation: z.boolean().default(true),
      sharpness: z.boolean().default(true),
      denoise: z.boolean().default(true),
    })
    .default({}),
});

type EnhancementSettings = z.infer<typeof settingsSchema>;

async function processImageEnhancement(
  inputBuffer: Buffer,
  settings: EnhancementSettings,
  filename: string,
) {
  const outputFormat = await resolveOutputFormat(inputBuffer, filename);
  const analysis = await analyzeImage(inputBuffer);

  let image = sharp(inputBuffer);
  image = applyCorrections(
    image,
    analysis.corrections,
    settings.mode,
    settings.intensity,
    settings.corrections,
  );

  const buffer = await image
    .toFormat(outputFormat.format, { quality: outputFormat.quality })
    .toBuffer();

  return { buffer, filename, contentType: outputFormat.contentType };
}

export function registerImageEnhancement(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "image-enhancement",
    settingsSchema,
    process: processImageEnhancement,
  });

  app.post(
    "/api/v1/tools/image-enhancement/analyze",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            break;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      if (validation.format === "heif") {
        try {
          fileBuffer = await decodeHeic(fileBuffer);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode HEIC file",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        fileBuffer = await autoOrient(fileBuffer);
        const analysis = await analyzeImage(fileBuffer);
        return reply.send(analysis);
      } catch (err) {
        return reply.status(422).send({
          error: "Analysis failed",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
