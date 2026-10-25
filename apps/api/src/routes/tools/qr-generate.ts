import { randomUUID } from "node:crypto";
import { hasServerErrorStatus } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { putObject } from "../../lib/object-storage.js";

const QR_MARGIN_MODULES = 2;

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

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Rasterize the QR module matrix at 1 pixel per module (at most 181x181 for
 * QR Version 40 with a 2-module quiet zone) so Sharp can scale to the target
 * size with nearest-neighbor interpolation on the libvips thread pool instead
 * of allocating up to 400 MB in pngjs on the Node.js main thread (#3604).
 */
function renderQrGridRgb(
  text: string,
  errorCorrectionLevel: "L" | "M" | "Q" | "H",
  foreground: string,
  background: string,
): { raw: Buffer; gridSize: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel });
  const moduleCount = qr.modules.size;
  const moduleData = qr.modules.data;
  const gridSize = moduleCount + QR_MARGIN_MODULES * 2;
  const dark = hexToRgb(foreground);
  const light = hexToRgb(background);
  const raw = Buffer.allocUnsafe(gridSize * gridSize * 3);

  for (let y = 0; y < gridSize; y++) {
    const inRow = y >= QR_MARGIN_MODULES && y < gridSize - QR_MARGIN_MODULES;
    const rowOffset = (y - QR_MARGIN_MODULES) * moduleCount;
    for (let x = 0; x < gridSize; x++) {
      const isDark =
        inRow &&
        x >= QR_MARGIN_MODULES &&
        x < gridSize - QR_MARGIN_MODULES &&
        Boolean(moduleData[rowOffset + (x - QR_MARGIN_MODULES)]);
      const color = isDark ? dark : light;
      const idx = (y * gridSize + x) * 3;
      raw[idx] = color[0];
      raw[idx + 1] = color[1];
      raw[idx + 2] = color[2];
    }
  }

  return { raw, gridSize };
}

/**
 * QR code generator - custom route (not factory) since it generates
 * images from text input, not from uploaded files.
 */
export function registerQrGenerate(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/qr-generate",
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
        // When a logo is present, force max error correction so the QR
        // remains scannable despite the logo occluding the center.
        const ecLevel = settings.logoDataUri ? "H" : settings.errorCorrection;

        const { raw, gridSize } = renderQrGridRgb(
          settings.text,
          ecLevel,
          settings.foreground,
          settings.background,
        );
        let pipeline = sharp(raw, {
          raw: { width: gridSize, height: gridSize, channels: 3 },
        }).resize(settings.size, settings.size, {
          kernel: sharp.kernel.nearest,
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

          pipeline = pipeline.composite([{ input: resizedLogo, gravity: "centre" }]);
        }

        const buffer = await pipeline.png().toBuffer();

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
        if (hasServerErrorStatus(err)) throw err;
        request.log?.warn({ err, toolId: "qr-generate" }, "QR code generation failed");
        return reply.status(422).send({
          error: "QR code generation failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }
    },
  );
}
