import { randomUUID } from "node:crypto";
import bwipjs from "bwip-js/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { putObject } from "../../lib/object-storage.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(256),
  type: z.enum(["code128", "ean13", "upca", "code39", "itf14", "datamatrix"]).default("code128"),
  scale: z.number().int().min(1).max(8).default(3),
  includeText: z.boolean().default(true),
});

/**
 * Barcode generator - custom route (not factory) since it generates
 * images from text input, not from uploaded files.
 * Mirrors qr-generate.ts exactly in route shape.
 */
export function registerBarcodeGenerate(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/barcode-generate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let body: unknown;
      try {
        body = request.body;
      } catch {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const result = settingsSchema.safeParse(body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(result.error.issues),
        });
      }

      const settings = result.data;

      try {
        const buffer = await bwipjs.toBuffer({
          bcid: settings.type,
          text: settings.text,
          scale: settings.scale,
          includetext: settings.includeText,
        });

        const jobId = randomUUID();
        const filename = "barcode.png";
        await putObject(`outputs/${jobId}/${filename}`, buffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${filename}`,
          originalSize: 0,
          processedSize: buffer.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0] : "Unknown error";
        return reply.status(400).send({
          error: `Invalid text for this barcode type: ${msg}`,
        });
      }
    },
  );
}
