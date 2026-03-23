import { z } from "zod";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { createWorkspace } from "../../lib/workspace.js";
import { validateImageBuffer } from "../../lib/file-validation.js";

const settingsSchema = z.object({
  layout: z.enum(["2x2", "3x3", "1x3", "2x1", "3x1", "1x2"]).default("2x2"),
  gap: z.number().min(0).max(50).default(4),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
});

function parseLayout(layout: string): { cols: number; rows: number } {
  const [cols, rows] = layout.split("x").map(Number);
  return { cols, rows };
}

export function registerCollage(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/collage",
    async (request, reply) => {
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

      if (files.length === 0) {
        return reply.status(400).send({ error: "No images provided" });
      }

      // Validate all files
      for (const file of files) {
        const validation = await validateImageBuffer(file.buffer);
        if (!validation.valid) {
          return reply.status(400).send({ error: `Invalid file "${file.filename}": ${validation.reason}` });
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
        const { cols, rows } = parseLayout(settings.layout);
        const totalSlots = cols * rows;

        // Determine cell size based on first image
        const firstMeta = await sharp(files[0].buffer).metadata();
        const cellW = firstMeta.width ?? 400;
        const cellH = firstMeta.height ?? 400;

        // Canvas dimensions
        const canvasW = cellW * cols + settings.gap * (cols + 1);
        const canvasH = cellH * rows + settings.gap * (rows + 1);

        // Parse background color
        const bgR = parseInt(settings.backgroundColor.slice(1, 3), 16);
        const bgG = parseInt(settings.backgroundColor.slice(3, 5), 16);
        const bgB = parseInt(settings.backgroundColor.slice(5, 7), 16);

        // Create canvas
        const composites: sharp.OverlayOptions[] = [];

        for (let i = 0; i < Math.min(files.length, totalSlots); i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const x = settings.gap + col * (cellW + settings.gap);
          const y = settings.gap + row * (cellH + settings.gap);

          const resized = await sharp(files[i].buffer)
            .resize(cellW, cellH, { fit: "cover" })
            .toBuffer();

          composites.push({ input: resized, top: y, left: x });
        }

        const result = await sharp({
          create: {
            width: canvasW,
            height: canvasH,
            channels: 3,
            background: { r: bgR, g: bgG, b: bgB },
          },
        })
          .composite(composites)
          .png()
          .toBuffer();

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const filename = "collage.png";
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
          error: "Collage creation failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
