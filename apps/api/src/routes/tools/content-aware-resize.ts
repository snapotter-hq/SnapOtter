import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { seamCarve } from "@snapotter/ai";
import { MAX_CONTENT_AWARE_RESIZE_PIXELS, MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { prepareRouteImage } from "../../lib/image-input-prep.js";
import { createToolRoute } from "../tool-factory.js";

const MISSING_DIMENSIONS_MESSAGE = "Either width, height, or square mode must be specified";

// caire's -width/-height/-blur/-sobel flags are integer-only; a fractional
// value makes the binary exit with a flag parse error.
const settingsSchema = z
  .object({
    width: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    height: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    protectFaces: z.boolean().default(false),
    blurRadius: z.number().int().min(0).max(20).default(4),
    sobelThreshold: z.number().int().min(1).max(20).default(2),
    square: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (!s.square && s.width === undefined && s.height === undefined) {
      ctx.addIssue({
        code: "custom",
        message: MISSING_DIMENSIONS_MESSAGE,
      });
      return;
    }
    if (s.square || s.width === undefined || s.height === undefined) return;
    if (s.width > MAX_RESIZE_OUTPUT_DIMENSION || s.height > MAX_RESIZE_OUTPUT_DIMENSION) return;
    if (s.width * s.height > MAX_CONTENT_AWARE_RESIZE_PIXELS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: `Target size ${s.width} x ${s.height} is over the ${MAX_CONTENT_AWARE_RESIZE_PIXELS} pixel limit`,
      });
    }
  });

type Settings = z.infer<typeof settingsSchema>;

/**
 * Content-aware resize (seam carving via caire) route. Its executionHint is
 * "long", so the factory answers 202 with a job id and the carve runs on the
 * queue with cancel and SSE progress (#4338).
 */
export function registerContentAwareResize(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "content-aware-resize",
    settingsSchema,
    process: withImageEncodeContext<unknown>(
      "Content-aware resize failed",
      (s) => ((s as Settings)?.square ? "square" : "custom"),
      async (inputBuffer, settings, filename, ctx) => {
        const s = settings as Settings;
        const cliCheck = await validateImageBuffer(inputBuffer, filename);
        const ext = extname(filename).toLowerCase().replace(/^\./, "");
        const format = cliCheck.valid
          ? cliCheck.format
          : ["heic", "heif", "hif"].includes(ext)
            ? "heif"
            : ext === "svg" || ext === "svgz"
              ? "svg"
              : "png";
        const prepared = await prepareRouteImage(inputBuffer, filename, format, {});
        const orientedBuffer = prepared.buffer;
        const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
        const needsCleanup = !ctx?.scratchDir;
        if (needsCleanup) await mkdir(scratchDir, { recursive: true });
        try {
          let result: Awaited<ReturnType<typeof seamCarve>>;
          try {
            result = await seamCarve(orientedBuffer, scratchDir, {
              width: s.width,
              height: s.height,
              protectFaces: s.protectFaces,
              blurRadius: s.blurRadius,
              sobelThreshold: s.sobelThreshold,
              square: s.square,
              signal: ctx?.signal,
            });
          } catch (err) {
            throw await asInputErrorIfUndecodable(orientedBuffer, err);
          }
          const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_seam.png`;
          return {
            buffer: result.buffer,
            filename: outputFilename,
            contentType: "image/png",
            resultPayload: { width: result.width, height: result.height },
          };
        } finally {
          if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    ),
  });
}
