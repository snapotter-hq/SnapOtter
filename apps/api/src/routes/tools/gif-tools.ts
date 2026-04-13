import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { zipSync } from "fflate";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["resize", "optimize", "speed", "reverse", "extract", "rotate"]).default("resize"),

  // Resize
  width: z.number().min(1).max(4096).optional(),
  height: z.number().min(1).max(4096).optional(),
  percentage: z.number().min(1).max(500).optional(),

  // Optimize
  colors: z.number().min(2).max(256).default(256),
  dither: z.number().min(0).max(1).default(1.0),
  effort: z.number().min(1).max(10).default(7),

  // Speed
  speedFactor: z.number().min(0.1).max(10).default(1.0),

  // Extract
  extractMode: z.enum(["single", "range", "all"]).default("single"),
  frameNumber: z.number().min(0).default(0),
  frameStart: z.number().min(0).default(0),
  frameEnd: z.number().min(0).optional(),
  extractFormat: z.enum(["png", "webp"]).default("png"),

  // Rotate
  angle: z
    .number()
    .refine((v) => [90, 180, 270].includes(v))
    .optional(),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),

  // Global
  loop: z.number().min(0).max(100).default(0),
});

export function registerGifTools(app: FastifyInstance) {
  // ── Metadata endpoint ───────────────────────────────────────────
  app.post("/api/v1/tools/gif-tools/info", async (request: FastifyRequest, reply: FastifyReply) => {
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
        }
      }
    } catch {
      return reply.status(400).send({ error: "Failed to parse request" });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No file provided" });
    }

    try {
      const meta = await sharp(fileBuffer).metadata();
      const pages = meta.pages ?? 1;
      const delay = meta.delay ?? Array(pages).fill(100);

      return reply.send({
        width: meta.width ?? 0,
        height: meta.pageHeight ?? meta.height ?? 0,
        pages,
        delay,
        loop: meta.loop ?? 0,
        fileSize: fileBuffer.length,
        duration: delay.reduce((sum: number, d: number) => sum + d, 0),
      });
    } catch {
      return reply.status(422).send({ error: "Could not read image metadata" });
    }
  });

  // ── Processing endpoint ─────────────────────────────────────────
  createToolRoute(app, {
    toolId: "gif-tools",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const baseName = filename.replace(/\.[^.]+$/, "");
      const loop = settings.loop;

      switch (settings.mode) {
        case "resize": {
          const image = sharp(inputBuffer, { animated: true });

          if (settings.percentage) {
            const meta = await image.metadata();
            const w = Math.round(((meta.width ?? 0) * settings.percentage) / 100);
            const h = Math.round(
              ((meta.pageHeight ?? meta.height ?? 0) * settings.percentage) / 100,
            );
            image.resize(w || undefined, h || undefined, { fit: "inside" });
          } else if (settings.width || settings.height) {
            image.resize(settings.width, settings.height, { fit: "inside" });
          }

          const buffer = await image.gif({ loop }).toBuffer();
          return { buffer, filename, contentType: "image/gif" };
        }

        case "optimize": {
          const buffer = await sharp(inputBuffer, { animated: true })
            .gif({
              effort: settings.effort,
              colours: settings.colors,
              dither: settings.dither,
              loop,
            })
            .toBuffer();
          return { buffer, filename, contentType: "image/gif" };
        }

        case "speed": {
          const meta = await sharp(inputBuffer, { animated: true }).metadata();
          const origDelays = meta.delay ?? Array(meta.pages ?? 1).fill(100);
          const newDelays = origDelays.map((d: number) =>
            Math.max(20, Math.round(d / settings.speedFactor)),
          );

          const buffer = await sharp(inputBuffer, { animated: true })
            .gif({ delay: newDelays, loop })
            .toBuffer();
          return { buffer, filename, contentType: "image/gif" };
        }

        case "reverse": {
          const meta = await sharp(inputBuffer, { animated: true }).metadata();
          const pageCount = meta.pages ?? 1;
          const pageHeight = meta.pageHeight ?? meta.height ?? 0;
          const width = meta.width ?? 0;
          const delays = [...(meta.delay ?? Array(pageCount).fill(100))];

          if (pageCount <= 1) {
            const buffer = await sharp(inputBuffer).gif({ loop }).toBuffer();
            return { buffer, filename, contentType: "image/gif" };
          }

          const rawData = await sharp(inputBuffer, { animated: true })
            .raw()
            .ensureAlpha()
            .toBuffer();

          const frameSize = width * pageHeight * 4;
          const frames: Buffer[] = [];
          for (let i = 0; i < pageCount; i++) {
            frames.push(Buffer.from(rawData.subarray(i * frameSize, (i + 1) * frameSize)));
          }

          frames.reverse();
          delays.reverse();

          // Apply optional speed adjustment (used when "Also adjust speed" is checked)
          if (settings.speedFactor !== 1.0) {
            for (let i = 0; i < delays.length; i++) {
              delays[i] = Math.max(20, Math.round(delays[i] / settings.speedFactor));
            }
          }

          const buffer = await sharp(Buffer.concat(frames), {
            raw: { width, height: pageHeight * pageCount, channels: 4 },
          })
            .gif({ delay: delays, loop })
            .toBuffer();

          return { buffer, filename, contentType: "image/gif" };
        }

        case "extract": {
          if (settings.extractMode === "single") {
            const frame = sharp(inputBuffer, { page: settings.frameNumber });
            const ext = settings.extractFormat;
            const buffer =
              ext === "webp" ? await frame.webp().toBuffer() : await frame.png().toBuffer();
            const outName = `${baseName}_frame${settings.frameNumber}.${ext}`;
            return {
              buffer,
              filename: outName,
              contentType: ext === "webp" ? "image/webp" : "image/png",
            };
          }

          // Range or All
          const meta = await sharp(inputBuffer).metadata();
          const pageCount = meta.pages ?? 1;
          const start = settings.extractMode === "all" ? 0 : settings.frameStart;
          const end =
            settings.extractMode === "all"
              ? pageCount - 1
              : Math.min(settings.frameEnd ?? pageCount - 1, pageCount - 1);

          const ext = settings.extractFormat;
          const files: Record<string, Uint8Array> = {};

          for (let i = start; i <= end; i++) {
            const frame = sharp(inputBuffer, { page: i });
            const buf =
              ext === "webp" ? await frame.webp().toBuffer() : await frame.png().toBuffer();
            files[`frame_${String(i).padStart(4, "0")}.${ext}`] = new Uint8Array(buf);
          }

          const zipData = zipSync(files);
          const zipBuffer = Buffer.from(zipData);
          return {
            buffer: zipBuffer,
            filename: `${baseName}_frames.zip`,
            contentType: "application/zip",
          };
        }

        case "rotate": {
          let image = sharp(inputBuffer, { animated: true });

          if (settings.angle) {
            image = image.rotate(settings.angle);
          }
          if (settings.flipV) {
            image = image.flip();
          }
          if (settings.flipH) {
            image = image.flop();
          }

          const buffer = await image.gif({ loop }).toBuffer();
          return { buffer, filename, contentType: "image/gif" };
        }

        default: {
          const buffer = await sharp(inputBuffer, { animated: true }).gif({ loop }).toBuffer();
          return { buffer, filename, contentType: "image/gif" };
        }
      }
    },
  });
}
