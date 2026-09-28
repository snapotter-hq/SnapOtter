import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { autoOrient } from "../../lib/auto-orient.js";
import { reportError } from "../../lib/error-report.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { putObject } from "../../lib/object-storage.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

/**
 * Hand zxing-wasm the packaged binary. Also how the route resets a failed
 * decoder (#1402): zxing compares overrides value by value and keeps its
 * cached instance, even a failed one, while they match. Each call reads a
 * fresh Buffer, which is what makes it a reset; caching the Buffer here would
 * silently stop that.
 */
export function initZXingReader(): void {
  const require = createRequire(import.meta.url);
  let wasmBinary: Buffer;
  try {
    wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"));
  } catch (err) {
    throw new Error(
      "barcode-read: could not load the bundled zxing_reader.wasm; reinstall dependencies",
      { cause: err },
    );
  }
  prepareZXingModule({ overrides: { wasmBinary } });
}

// Hand zxing-wasm the packaged binary so it never fetches it from jsdelivr (#1385).
initZXingReader();

const settingsSchema = z.object({
  tryHarder: z.boolean().default(true),
});

/**
 * Color palette for bounding-box overlays.
 * Semi-transparent fills paired with solid strokes.
 */
const BOX_COLORS = [
  { fill: "rgba(59,130,246,0.18)", stroke: "rgba(59,130,246,0.9)" }, // blue
  { fill: "rgba(34,197,94,0.18)", stroke: "rgba(34,197,94,0.9)" }, // green
  { fill: "rgba(245,158,11,0.18)", stroke: "rgba(245,158,11,0.9)" }, // amber
  { fill: "rgba(239,68,68,0.18)", stroke: "rgba(239,68,68,0.9)" }, // red
  { fill: "rgba(168,85,247,0.18)", stroke: "rgba(168,85,247,0.9)" }, // purple
  { fill: "rgba(236,72,153,0.18)", stroke: "rgba(236,72,153,0.9)" }, // pink
];

/**
 * Build an SVG overlay with numbered polygon bounding boxes for each barcode.
 */
function buildOverlaySvg(
  width: number,
  height: number,
  barcodes: {
    position: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
      bottomRight: { x: number; y: number };
    };
  }[],
): string {
  const shortSide = Math.min(width, height);
  const strokeWidth = Math.max(2, Math.round(shortSide / 200));
  const fontSize = Math.max(14, Math.round(shortSide / 40));
  const labelPad = Math.round(fontSize * 0.4);

  let elements = "";

  for (let i = 0; i < barcodes.length; i++) {
    const { position: pos } = barcodes[i];
    const color = BOX_COLORS[i % BOX_COLORS.length];

    // Polygon points: TL -> TR -> BR -> BL
    const points = [
      `${pos.topLeft.x},${pos.topLeft.y}`,
      `${pos.topRight.x},${pos.topRight.y}`,
      `${pos.bottomRight.x},${pos.bottomRight.y}`,
      `${pos.bottomLeft.x},${pos.bottomLeft.y}`,
    ].join(" ");

    elements += `<polygon points="${points}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${strokeWidth}"/>`;

    // Numbered label above top-left corner
    const labelX = pos.topLeft.x;
    const labelY = Math.max(pos.topLeft.y - labelPad, fontSize + labelPad);

    elements += `<text x="${labelX}" y="${labelY}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color.stroke}">${i + 1}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${elements}</svg>`;
}

/**
 * Read barcodes (all 1D + 2D types) from uploaded images using zxing-wasm.
 */
export function registerBarcodeRead(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/barcode-read",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;

      // --- Parse multipart ---
      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = sanitizeFilename(part.filename ?? "image");
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          }
        }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      // --- Validate ---
      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({
          error: `Invalid image: ${validation.reason}`,
        });
      }

      // Parse and validate settings
      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        const tryHarder = settings.tryHarder;

        if (validation.format === "heif") {
          try {
            fileBuffer = await decodeHeic(fileBuffer);
          } catch (err) {
            if (isDecoderUnavailable(err)) throw err;
            return reply.status(422).send({
              error: "Failed to decode HEIC file. Ensure libheif-examples is installed.",
              details: err instanceof Error ? err.message : String(err),
            });
          }
        }
        if (needsCliDecode(validation.format)) {
          try {
            const fileExt = filename.split(".").pop()?.toLowerCase();
            fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt);
          } catch (decodeErr) {
            try {
              await sharp(fileBuffer).metadata();
            } catch (err) {
              if (isDecoderUnavailable(decodeErr)) throw decodeErr;
              return reply.status(422).send({
                error: `Failed to decode ${validation.format.toUpperCase()} file`,
                details: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
        if (validation.format === "svg") {
          try {
            fileBuffer = decompressSvgz(fileBuffer);
            fileBuffer = sanitizeSvg(fileBuffer);
          } catch (err) {
            return reply.status(400).send({
              error: err instanceof Error ? err.message : "Invalid SVG",
            });
          }
        }
        fileBuffer = await autoOrient(fileBuffer);

        // Convert to raw RGBA pixel data
        const image = sharp(fileBuffer);
        const metadata = await image.metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        if (width === 0 || height === 0) {
          return reply.status(422).send({
            error: "Could not determine image dimensions",
          });
        }

        const rawData = await image.ensureAlpha().raw().toBuffer();

        // --- Detect barcodes via zxing-wasm ---
        const imageData = {
          data: new Uint8ClampedArray(rawData.buffer, rawData.byteOffset, rawData.length),
          width,
          height,
        } as ImageData;

        const results = await readBarcodes(imageData, {
          tryHarder,
          maxNumberOfSymbols: 255,
        });

        const validResults = results.filter((r) => r.isValid);

        // Map to the response shape
        const barcodes = validResults.map((r) => ({
          type: r.format,
          text: r.text,
          position: {
            topLeft: { x: r.position.topLeft.x, y: r.position.topLeft.y },
            topRight: { x: r.position.topRight.x, y: r.position.topRight.y },
            bottomLeft: {
              x: r.position.bottomLeft.x,
              y: r.position.bottomLeft.y,
            },
            bottomRight: {
              x: r.position.bottomRight.x,
              y: r.position.bottomRight.y,
            },
          },
        }));

        // No barcodes found - return early
        if (barcodes.length === 0) {
          return reply.send({
            filename,
            barcodes: [],
            annotatedUrl: null,
            previewUrl: null,
          });
        }

        // --- Generate annotated image ---
        const jobId = randomUUID();

        // Save original input
        await putObject(`uploads/${jobId}/${filename}`, fileBuffer);

        // Build SVG overlay with bounding boxes
        const overlaySvg = buildOverlaySvg(width, height, barcodes);

        const stem = filename.replace(/\.[^.]+$/, "");
        const outputFilename = `annotated-${stem}.png`;

        const annotatedBuffer = await sharp(fileBuffer)
          .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
          .png()
          .toBuffer();

        await putObject(`outputs/${jobId}/${outputFilename}`, annotatedBuffer);

        const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;

        return reply.send({
          filename,
          barcodes,
          annotatedUrl: downloadUrl,
          previewUrl: downloadUrl,
        });
      } catch (err) {
        if (isDecoderUnavailable(err)) throw err;
        // A WebAssembly RuntimeError is the decoder itself failing: it couldn't
        // instantiate (the glue wraps every instantiate error this way), or it
        // trapped mid-decode, after which the instance can't be trusted.
        // Either way it's a server fault, not a bad image. zxing-wasm caches a
        // failed instantiation for good, so hand it the binary again: new
        // overrides drop the cached instance and the next request starts a
        // fresh one (#1402).
        if (err instanceof WebAssembly.RuntimeError) {
          request.log.error(
            { err, toolId: "barcode-read" },
            "Barcode decoder failed; reloading it for the next request",
          );
          void reportError(err, { source: "http", toolId: "barcode-read", statusCode: 503 });
          initZXingReader();
          return reply.status(503).send({
            error: "Barcode reading failed on this server.",
            details: "The barcode decoder failed and has been reloaded. Try again.",
            code: "ENGINE_UNAVAILABLE",
          });
        }
        request.log.error({ err, toolId: "barcode-read" }, "Barcode read failed");
        return reply.status(422).send({
          error: "Barcode reading failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
