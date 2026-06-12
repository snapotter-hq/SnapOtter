import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { putObject } from "../../lib/object-storage.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(2000),
  size: z.number().min(100).max(10000).default(400),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
  foreground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FFFFFF"),
  logoDataUri: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .max(700000)
    .optional(),
});

/**
 * QR code generator - custom route (not factory) since it generates
 * images from text input, not from uploaded files.
 */
export function registerQrGenerate(app: FastifyInstance) {
  app.post("/api/v1/tools/qr-generate", async (request: FastifyRequest, reply: FastifyReply) => {
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
      // When a logo is present, force max error correction so the QR
      // remains scannable despite the logo occluding the center.
      const ecLevel = settings.logoDataUri ? "H" : settings.errorCorrection;

      let buffer = await QRCode.toBuffer(settings.text, {
        width: settings.size,
        errorCorrectionLevel: ecLevel,
        color: {
          dark: settings.foreground,
          light: settings.background,
        },
        type: "png",
        margin: 2,
      });

      if (settings.logoDataUri) {
        // Decode the data-URI base64 payload into a buffer
        const base64Part = settings.logoDataUri.split(",")[1];
        let logoBuffer: Buffer;
        try {
          logoBuffer = Buffer.from(base64Part, "base64");
          // Validate that sharp can decode it
          await sharp(logoBuffer).metadata();
        } catch {
          return reply.status(400).send({ error: "Invalid logo image" });
        }

        // Resize logo to 22% of QR size and composite centered
        const logoSize = Math.round(settings.size * 0.22);
        const resizedLogo = await sharp(logoBuffer)
          .resize(logoSize, logoSize, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
          })
          .png()
          .toBuffer();

        buffer = await sharp(buffer)
          .composite([{ input: resizedLogo, gravity: "centre" }])
          .png()
          .toBuffer();
      }

      const jobId = randomUUID();
      const filename = "qrcode.png";
      await putObject(`outputs/${jobId}/${filename}`, buffer);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${filename}`,
        originalSize: 0,
        processedSize: buffer.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "QR code generation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
