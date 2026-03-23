import sharp from "sharp";
import jsQR from "jsqr";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { basename } from "node:path";
import { validateImageBuffer } from "../../lib/file-validation.js";

/**
 * Read QR codes and barcodes from uploaded images.
 */
export function registerBarcodeRead(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/barcode-read",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = basename(part.filename ?? "image");
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      // Validate the uploaded image
      const validation = await validateImageBuffer(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      try {
        // Convert to RGBA raw pixel data for jsQR
        const image = sharp(fileBuffer);
        const metadata = await image.metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        const rawData = await image
          .ensureAlpha()
          .raw()
          .toBuffer();

        const code = jsQR(
          new Uint8ClampedArray(rawData.buffer, rawData.byteOffset, rawData.length),
          width,
          height,
        );

        if (!code) {
          return reply.send({
            filename,
            found: false,
            text: null,
            message: "No QR code found in the image",
          });
        }

        return reply.send({
          filename,
          found: true,
          text: code.data,
          location: {
            topLeft: code.location.topLeftCorner,
            topRight: code.location.topRightCorner,
            bottomLeft: code.location.bottomLeftCorner,
            bottomRight: code.location.bottomRightCorner,
          },
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Barcode reading failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
