import { MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/image-engine";
import { ToolInputError } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { zipSync } from "fflate";
import sharp from "sharp";
import { z } from "zod";
import {
  assertGifWorkload,
  MAX_GIF_TOTAL_PIXELS,
  resolveGifResizeDimensions,
} from "../../lib/gif-limits.js";
import { withImageEncodeContext } from "../../lib/image-error.js";
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
  width: z.number().int().min(1).max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
  height: z.number().int().min(1).max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
  percentage: z.number().finite().min(1).max(500).optional(),

  // Optimize
  colors: z.number().int().min(2).max(256).default(256),
  dither: z.number().min(0).max(1).default(1.0),
  effort: z.number().int().min(1).max(10).default(7),

  // Speed
  speedFactor: z.number().min(0.1).max(10).default(1.0),

  // Extract
  extractMode: z.enum(["single", "range", "all"]).default("single"),
  frameNumber: z.number().int().min(0).default(0),
  frameStart: z.number().int().min(0).default(0),
  frameEnd: z.number().int().min(0).optional(),
  extractFormat: z.enum(["png", "webp"]).default("png"),

  // Rotate
  angle: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),

  // Global
  loop: z.number().int().min(0).max(100).default(0),
});

async function inspectGifWorkload(inputBuffer: Buffer) {
  const metadata = await sharp(inputBuffer, {
    animated: true,
    limitInputPixels: false,
  }).metadata();
  return { metadata, workload: assertGifWorkload(metadata) };
}

function assertGifResizeOutput(
  workload: ReturnType<typeof assertGifWorkload>,
  settings: z.infer<typeof settingsSchema>,
) {
  if (settings.mode !== "resize") return;
  const output = resolveGifResizeDimensions(workload, settings);
  assertGifWorkload(
    { width: output.width, height: output.height, pages: workload.frames },
    "GIF resize output",
  );
}

export function registerGifTools(app: FastifyInstance) {
  // ── Metadata endpoint ───────────────────────────────────────────
  app.post(
    "/api/v1/tools/image/gif-tools/info",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
  );

  // ── Processing endpoint ─────────────────────────────────────────
  createToolRoute(app, {
    toolId: "gif-tools",
    settingsSchema,
    preValidate: async ({ inputs, settings }) => {
      const { workload } = await inspectGifWorkload(inputs[0].buffer);
      assertGifResizeOutput(workload, settings);
    },
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "GIF processing failed",
      (s) => s.mode,
      async (inputBuffer, settings, filename) => {
        const baseName = filename.replace(/\.[^.]+$/, "");
        const loop = settings.loop;
        const { metadata, workload: inputWorkload } = await inspectGifWorkload(inputBuffer);
        assertGifResizeOutput(inputWorkload, settings);

        switch (settings.mode) {
          case "resize": {
            const output = resolveGifResizeDimensions(inputWorkload, settings);

            const image = sharp(inputBuffer, {
              animated: true,
              limitInputPixels: MAX_GIF_TOTAL_PIXELS,
            });

            if (settings.percentage !== undefined) {
              image.resize(output.width, output.height, { fit: "inside" });
            } else if (settings.width || settings.height) {
              image.resize(settings.width, settings.height, { fit: "inside" });
            }

            const buffer = await image.gif({ loop }).toBuffer();
            return { buffer, filename, contentType: "image/gif" };
          }

          case "optimize": {
            const buffer = await sharp(inputBuffer, {
              animated: true,
              limitInputPixels: MAX_GIF_TOTAL_PIXELS,
            })
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
            const origDelays = metadata.delay ?? Array(inputWorkload.frames).fill(100);
            const newDelays = origDelays.map((d: number) =>
              Math.max(20, Math.round(d / settings.speedFactor)),
            );

            const buffer = await sharp(inputBuffer, {
              animated: true,
              limitInputPixels: MAX_GIF_TOTAL_PIXELS,
            })
              .gif({ delay: newDelays, loop })
              .toBuffer();
            return { buffer, filename, contentType: "image/gif" };
          }

          case "reverse": {
            const pageCount = inputWorkload.frames;
            const delays = [...(metadata.delay ?? Array(pageCount).fill(100))];

            if (pageCount <= 1) {
              const buffer = await sharp(inputBuffer, {
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              })
                .gif({ loop })
                .toBuffer();
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
              const frameBuf = await sharp(inputBuffer, {
                page: i,
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              })
                .gif({ delay: [delays[pageCount - 1 - i]], loop })
                .toBuffer();
              frameGifs.push(frameBuf);
            }

            const buffer = assembleAnimatedGif(frameGifs, loop);
            return { buffer, filename, contentType: "image/gif" };
          }

          case "extract": {
            if (settings.extractMode === "single") {
              if (settings.frameNumber >= inputWorkload.frames) {
                throw new ToolInputError("Requested GIF frame does not exist");
              }
              const frame = sharp(inputBuffer, {
                page: settings.frameNumber,
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              });
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
            const pageCount = inputWorkload.frames;
            const start = settings.extractMode === "all" ? 0 : settings.frameStart;
            const end =
              settings.extractMode === "all"
                ? pageCount - 1
                : Math.min(settings.frameEnd ?? pageCount - 1, pageCount - 1);

            if (start >= pageCount || end < start) {
              throw new ToolInputError("Requested GIF frame range does not exist");
            }

            const ext = settings.extractFormat;
            const files: Record<string, Uint8Array> = {};

            for (let i = start; i <= end; i++) {
              const frame = sharp(inputBuffer, {
                page: i,
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              });
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
            const pageCount = inputWorkload.frames;
            const delays = metadata.delay ?? Array(pageCount).fill(100);

            // Sharp cannot rotate multi-page images directly, so process
            // each frame individually and reassemble the animation.
            const frameGifs: Buffer[] = [];
            for (let i = 0; i < pageCount; i++) {
              let frame = sharp(inputBuffer, {
                page: i,
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              });
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
            const buffer = await sharp(inputBuffer, {
              animated: true,
              limitInputPixels: MAX_GIF_TOTAL_PIXELS,
            })
              .gif({ loop })
              .toBuffer();
            return { buffer, filename, contentType: "image/gif" };
          }
        }
      },
    ),
  });
}
