import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { readBarcodes } from "zxing-wasm/reader";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

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
  app.post("/api/v1/tools/barcode-read", async (request: FastifyRequest, reply: FastifyReply) => {
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
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
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

      // Decode HEIC/HEIF if needed, then auto-orient
      fileBuffer = await ensureSharpCompat(fileBuffer);
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
      };

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
      const workspacePath = await createWorkspace(jobId);

      // Save original input
      const inputPath = join(workspacePath, "input", filename);
      await writeFile(inputPath, fileBuffer);

      // Build SVG overlay with bounding boxes
      const overlaySvg = buildOverlaySvg(width, height, barcodes);

      const stem = filename.replace(/\.[^.]+$/, "");
      const outputFilename = `annotated-${stem}.png`;
      const outputPath = join(workspacePath, "output", outputFilename);

      const annotatedBuffer = await sharp(fileBuffer)
        .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
        .png()
        .toBuffer();

      await writeFile(outputPath, annotatedBuffer);

      const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;

      return reply.send({
        filename,
        barcodes,
        annotatedUrl: downloadUrl,
        previewUrl: downloadUrl,
      });
    } catch (err) {
      request.log.error({ err, toolId: "barcode-read" }, "Barcode read failed");
      return reply.status(422).send({
        error: "Barcode reading failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
