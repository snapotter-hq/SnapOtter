import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createWorkspace } from "../../lib/workspace.js";

const MAX_CANVAS_PIXELS = 100_000_000;

const settingsSchema = z.object({
  direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
  resize: z.enum(["fit", "original"]).default("fit"),
  gap: z.number().min(0).max(100).default(0),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FFFFFF"),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
});

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerStitch(app: FastifyInstance) {
  app.post("/api/v1/tools/stitch", async (request, reply) => {
    const files: Array<{ buffer: Buffer; filename: string }> = [];
    let settingsRaw: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (buf.length > 0) {
            files.push({
              buffer: buf,
              filename: basename(part.filename ?? `image-${files.length}`),
            });
          }
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

    if (files.length < 2) {
      return reply.status(400).send({ error: "At least 2 images are required for stitching" });
    }

    // Validate all files
    for (const file of files) {
      const validation = await validateImageBuffer(file.buffer);
      if (!validation.valid) {
        return reply
          .status(400)
          .send({ error: `Invalid file "${file.filename}": ${validation.reason}` });
      }
    }

    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply.status(400).send({ error: "Invalid settings", details: result.error.issues });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    try {
      // Read metadata for all images
      const imageMetas = await Promise.all(
        files.map(async (file) => {
          const meta = await sharp(file.buffer).metadata();
          return {
            buffer: file.buffer,
            width: meta.width ?? 0,
            height: meta.height ?? 0,
          };
        }),
      );

      // Resize images if needed
      const isHorizontal = settings.direction === "horizontal";
      let prepared: Array<{ buffer: Buffer; width: number; height: number }>;

      if (settings.resize === "fit") {
        if (isHorizontal) {
          // Find min height, scale taller images down
          const minHeight = Math.min(...imageMetas.map((m) => m.height));
          prepared = await Promise.all(
            imageMetas.map(async (img) => {
              if (img.height > minHeight) {
                const scaledWidth = Math.round((img.width * minHeight) / img.height);
                const resized = await sharp(img.buffer).resize(scaledWidth, minHeight).toBuffer();
                return { buffer: resized, width: scaledWidth, height: minHeight };
              }
              return img;
            }),
          );
        } else {
          // Find min width, scale wider images down
          const minWidth = Math.min(...imageMetas.map((m) => m.width));
          prepared = await Promise.all(
            imageMetas.map(async (img) => {
              if (img.width > minWidth) {
                const scaledHeight = Math.round((img.height * minWidth) / img.width);
                const resized = await sharp(img.buffer).resize(minWidth, scaledHeight).toBuffer();
                return { buffer: resized, width: minWidth, height: scaledHeight };
              }
              return img;
            }),
          );
        }
      } else {
        prepared = imageMetas;
      }

      // Calculate canvas dimensions
      const n = prepared.length;
      let canvasWidth: number;
      let canvasHeight: number;

      if (isHorizontal) {
        canvasWidth = prepared.reduce((sum, img) => sum + img.width, 0) + settings.gap * (n - 1);
        canvasHeight = Math.max(...prepared.map((img) => img.height));
      } else {
        canvasWidth = Math.max(...prepared.map((img) => img.width));
        canvasHeight = prepared.reduce((sum, img) => sum + img.height, 0) + settings.gap * (n - 1);
      }

      // Canvas size check
      if (canvasWidth * canvasHeight > MAX_CANVAS_PIXELS) {
        return reply.status(422).send({
          error: `Canvas too large: ${canvasWidth}x${canvasHeight} (${Math.round((canvasWidth * canvasHeight) / 1_000_000)}MP exceeds 100MP limit)`,
        });
      }

      // Build composites
      const background = parseHexColor(settings.backgroundColor);
      const composites: sharp.OverlayOptions[] = [];
      let offset = 0;

      for (const img of prepared) {
        let left: number;
        let top: number;

        if (isHorizontal) {
          left = offset;
          top = Math.round((canvasHeight - img.height) / 2);
          offset += img.width + settings.gap;
        } else {
          left = Math.round((canvasWidth - img.width) / 2);
          top = offset;
          offset += img.height + settings.gap;
        }

        composites.push({ input: img.buffer, left, top });
      }

      // Create canvas and composite
      let pipeline = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: background.r, g: background.g, b: background.b, alpha: 1 },
        },
      }).composite(composites);

      // Output in requested format
      if (settings.format === "jpeg") {
        pipeline = pipeline.jpeg({ quality: 90 });
      } else if (settings.format === "webp") {
        pipeline = pipeline.webp({ quality: 90 });
      } else {
        pipeline = pipeline.png();
      }

      const result = await pipeline.toBuffer();

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const filename = `stitch.${settings.format}`;
      const outputPath = join(workspacePath, "output", filename);
      await writeFile(outputPath, result);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${filename}`,
        originalSize: files.reduce((s, f) => s + f.buffer.length, 0),
        processedSize: result.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Stitch creation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
