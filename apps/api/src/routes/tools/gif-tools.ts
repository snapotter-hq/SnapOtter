import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { zipSync } from "fflate";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

/**
 * Assemble multiple single-frame GIF buffers into one animated GIF.
 *
 * Sharp 0.33.x cannot set the page-height metadata on images constructed
 * from raw pixel data, so re-encoding reversed frames through sharp's
 * `.gif()` produces a single tall frame instead of an animation.
 *
 * This helper works at the GIF89a binary level: it takes the header,
 * logical screen descriptor, and global color table from the first frame,
 * adds a NETSCAPE2.0 looping extension, then appends the graphic control
 * extension + image data blocks from every frame.
 */
function assembleAnimatedGif(frameGifs: Buffer[], loop: number): Buffer {
  const first = frameGifs[0];

  // Parse the Logical Screen Descriptor to find the Global Color Table size
  const packed = first[10]; // byte 10 = packed field in LSD
  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  const headerEnd = 13 + gctSize; // 6 (sig) + 7 (LSD) + GCT

  // Header + LSD + GCT from the first frame
  const header = first.subarray(0, headerEnd);

  // NETSCAPE2.0 application extension for looping
  const loopLo = loop & 0xff;
  const loopHi = (loop >> 8) & 0xff;
  const loopExt = Buffer.from([
    0x21,
    0xff,
    0x0b, // application extension introducer
    ...Buffer.from("NETSCAPE2.0"),
    0x03,
    0x01,
    loopLo,
    loopHi, // sub-block: loop count
    0x00, // block terminator
  ]);

  const parts: Buffer[] = [header, loopExt];

  // Extract frame data (everything between the header/GCT and the trailer)
  for (const gif of frameGifs) {
    const p = gif[10];
    const hasTable = (p & 0x80) !== 0;
    const tableSize = hasTable ? 3 * (1 << ((p & 0x07) + 1)) : 0;
    const dataStart = 13 + tableSize;
    const dataEnd = gif.length - 1; // exclude 0x3B trailer
    if (dataEnd > dataStart) {
      parts.push(gif.subarray(dataStart, dataEnd));
    }
  }

  parts.push(Buffer.from([0x3b])); // GIF trailer
  return Buffer.concat(parts);
}

const settingsSchema = z.object({
  mode: z.enum(["resize", "optimize", "speed", "reverse", "extract", "rotate"]).default("resize"),

  // Resize
  width: z.number().min(1).max(16384).optional(),
  height: z.number().min(1).max(16384).optional(),
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
          const delays = [...(meta.delay ?? Array(pageCount).fill(100))];

          if (pageCount <= 1) {
            const buffer = await sharp(inputBuffer).gif({ loop }).toBuffer();
            return { buffer, filename, contentType: "image/gif" };
          }

          delays.reverse();

          // Apply optional speed adjustment (used when "Also adjust speed" is checked)
          if (settings.speedFactor !== 1.0) {
            for (let i = 0; i < delays.length; i++) {
              delays[i] = Math.max(20, Math.round(delays[i] / settings.speedFactor));
            }
          }

          // Extract each frame as a single-frame GIF with the correct delay,
          // then combine into a multi-frame GIF at the binary level.
          // This avoids going through raw pixel data, which loses the
          // page-height metadata that sharp/libvips needs for animation.
          const frameGifs: Buffer[] = [];
          for (let i = pageCount - 1; i >= 0; i--) {
            const frameBuf = await sharp(inputBuffer, { page: i })
              .gif({ delay: [delays[pageCount - 1 - i]], loop })
              .toBuffer();
            frameGifs.push(frameBuf);
          }

          const buffer = assembleAnimatedGif(frameGifs, loop);
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
          const meta = await sharp(inputBuffer, { animated: true }).metadata();
          const pageCount = meta.pages ?? 1;
          const delays = meta.delay ?? Array(pageCount).fill(100);

          // Sharp cannot rotate multi-page images directly, so process
          // each frame individually and reassemble the animation.
          const frameGifs: Buffer[] = [];
          for (let i = 0; i < pageCount; i++) {
            let frame = sharp(inputBuffer, { page: i });
            if (settings.angle) {
              frame = frame.rotate(settings.angle);
            }
            if (settings.flipV) {
              frame = frame.flip();
            }
            if (settings.flipH) {
              frame = frame.flop();
            }
            const frameBuf = await frame.gif({ delay: [delays[i]], loop }).toBuffer();
            frameGifs.push(frameBuf);
          }

          const buffer = pageCount > 1 ? assembleAnimatedGif(frameGifs, loop) : frameGifs[0];
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
