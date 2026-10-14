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
import { multipartFailure } from "../../lib/multipart-parts.js";
import { createToolRoute } from "../tool-factory.js";

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
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
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

            // Resampling invents colours between the ones the source held, and
            // Sharp's writer would otherwise express them in the palette it
            // read the input with, so a resized GIF came back in the wrong
            // colours (#1190).
            const buffer = await image.gif({ loop, reuse: false }).toBuffer();
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

            // Decode each frame to PNG in reverse order and rejoin into an
            // animated GIF so Sharp quantises the animation across all frames
            // instead of splicing later frames onto the first frame's colour
            // table (#1221).
            const frames: Buffer[] = [];
            for (let i = pageCount - 1; i >= 0; i--) {
              const frameBuf = await sharp(inputBuffer, {
                page: i,
                limitInputPixels: MAX_GIF_TOTAL_PIXELS,
              })
                .png()
                .toBuffer();
              frames.push(frameBuf);
            }

            const buffer = await sharp(frames, { join: { across: 1, animated: true } })
              .gif({ delay: delays, loop })
              .toBuffer();
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

            // Sharp cannot rotate multi-page images directly, so transform
            // each frame as PNG and rejoin the animation (#1221).
            const frames: Buffer[] = [];
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
              frames.push(await frame.png().toBuffer());
            }

            const joined =
              pageCount > 1
                ? sharp(frames, { join: { across: 1, animated: true } })
                : sharp(frames[0]);
            const buffer = await joined.gif({ delay: delays, loop }).toBuffer();
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
