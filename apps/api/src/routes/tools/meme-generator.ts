import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { hasServerErrorStatus, isToolInputError } from "@snapotter/shared";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { renderMemeTextSvg } from "../../lib/meme-text-renderer.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError, putObject } from "../../lib/object-storage.js";
import { decompressSvgz, isSvgClientError, sanitizeSvg } from "../../lib/svg-sanitize.js";
import { InputValidationError } from "../../modality/contract.js";
import { registerToolProcessFn } from "../tool-factory.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  templateId: z.string().optional(),
  textLayout: z
    .enum(["top-bottom", "top-only", "bottom-only", "center", "side-by-side"])
    .default("top-bottom"),
  textBoxes: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  fontFamily: z
    .enum([
      "anton",
      "arial-black",
      "comic-sans",
      "montserrat",
      "bebas-neue",
      "permanent-marker",
      "roboto",
    ])
    .default("anton"),
  fontSize: z.number().min(8).max(200).optional(),
  textColor: z.string().default("#ffffff"),
  strokeColor: z.string().default("#000000"),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  allCaps: z.boolean().default(true),
});

type Settings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Preset text layouts (for custom images)
// ---------------------------------------------------------------------------

const PRESET_LAYOUTS: Record<
  string,
  Array<{ id: string; x: number; y: number; width: number; height: number }>
> = {
  "top-bottom": [
    { id: "top", x: 5, y: 2, width: 90, height: 20 },
    { id: "bottom", x: 5, y: 78, width: 90, height: 20 },
  ],
  "top-only": [{ id: "top", x: 5, y: 2, width: 90, height: 25 }],
  "bottom-only": [{ id: "bottom", x: 5, y: 75, width: 90, height: 23 }],
  center: [{ id: "center", x: 10, y: 35, width: 80, height: 30 }],
  "side-by-side": [
    { id: "left", x: 2, y: 35, width: 46, height: 30 },
    { id: "right", x: 52, y: 35, width: 46, height: 30 },
  ],
};

// ---------------------------------------------------------------------------
// Template manifest
// ---------------------------------------------------------------------------

interface TemplateTextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultText?: string;
}

interface Template {
  id: string;
  filename: string;
  width: number;
  height: number;
  textBoxes: TemplateTextBox[];
}

interface Manifest {
  templates: Template[];
}

const STATIC_DIR = join(import.meta.dirname, "../../../static");
const TEMPLATES_DIR = join(STATIC_DIR, "meme-templates");

let manifestCache: Manifest | null = null;

function getManifest(): Manifest {
  if (manifestCache === null) {
    const raw = readFileSync(join(TEMPLATES_DIR, "meme-templates.json"), "utf-8");
    manifestCache = JSON.parse(raw) as Manifest;
  }
  return manifestCache;
}

function findTemplate(templateId: string): Template | undefined {
  return getManifest().templates.find((t) => t.id === templateId);
}

function sanitizeSvgInput(buf: Buffer): Buffer {
  try {
    const decompressed = decompressSvgz(buf);
    return sanitizeSvg(decompressed);
  } catch (err) {
    if (isSvgClientError(err)) {
      const validationErr = new InputValidationError(
        err instanceof Error ? err.message : "Invalid SVG",
      );
      validationErr.cause = err;
      throw validationErr;
    }
    throw asDecoderOutOfMemory(err);
  }
}

async function prepareMemeImage(
  inputBuffer: Buffer,
  filename: string,
  log?: Pick<FastifyBaseLogger, "warn">,
): Promise<Buffer> {
  let buf = inputBuffer;
  const validation = await validateImageBuffer(buf, filename);
  if (!validation.valid) {
    throw new InputValidationError(`Invalid image: ${validation.reason}`);
  }
  if (validation.format === "heif") {
    try {
      buf = await decodeHeic(buf);
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
      throw await asInputErrorIfUndecodable(buf, err);
    }
  }
  let fallbackFormat: string | undefined;
  if (needsCliDecode(validation.format)) {
    try {
      const fileExt = extname(filename).toLowerCase().replace(/^\./, "") || undefined;
      buf = await decodeToSharpCompat(buf, validation.format, fileExt);
    } catch (rawDecodeErr) {
      const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
      if (
        decodeErr instanceof DecoderOutOfMemoryError ||
        (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
      ) {
        throw decodeErr;
      }
      try {
        const meta = await sharp(buf).metadata();
        fallbackFormat = meta.format;
        if (fallbackFormat !== "svg") {
          await sharp(buf).resize(1).raw().toBuffer();
        }
      } catch (rawProbeErr) {
        const probeErr = asDecoderOutOfMemory(rawProbeErr);
        if (probeErr instanceof DecoderOutOfMemoryError) throw probeErr;
        if (isDecoderUnavailable(decodeErr) || hasServerErrorStatus(decodeErr)) throw decodeErr;
        throw await asInputErrorIfUndecodable(buf, rawProbeErr);
      }
    }
  }
  let isSvg = validation.format === "svg" || fallbackFormat === "svg";
  if (!isSvg && validation.format === "png" && filename.toLowerCase().endsWith(".apng")) {
    const meta = await sharp(buf)
      .metadata()
      .catch((err: unknown) => {
        const oom = asDecoderOutOfMemory(err);
        if (oom instanceof DecoderOutOfMemoryError) throw oom;
        return null;
      });
    if (meta?.format === "svg") isSvg = true;
  }
  if (isSvg) {
    buf = sanitizeSvgInput(buf);
  } else {
    buf = await autoOrient(buf, log);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Core processing function (shared by HTTP route and pipeline registry)
// ---------------------------------------------------------------------------

async function processMeme(
  imageBuffer: Buffer,
  settings: Settings,
  filename: string,
  templateTextBoxes?: TemplateTextBox[],
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  let meta: Metadata;
  try {
    meta = await sharp(imageBuffer).metadata();
  } catch (err) {
    throw await asInputErrorIfUndecodable(imageBuffer, err);
  }
  const imageWidth = meta.width ?? 800;
  const imageHeight = meta.height ?? 600;

  // Resolve text box positions: template boxes or preset layout
  const layoutBoxes =
    templateTextBoxes ?? PRESET_LAYOUTS[settings.textLayout] ?? PRESET_LAYOUTS["top-bottom"];

  // Map settings.textBoxes onto layout positions
  const textBoxes = layoutBoxes
    .map((box) => {
      const userBox = settings.textBoxes.find((tb) => tb.id === box.id);
      return {
        text: userBox?.text ?? "",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    })
    .filter((box) => box.text.length > 0);

  let result: Buffer;

  try {
    if (textBoxes.length > 0) {
      const svgBuffer = renderMemeTextSvg({
        imageWidth,
        imageHeight,
        textBoxes,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        textColor: settings.textColor,
        strokeColor: settings.strokeColor,
        textAlign: settings.textAlign,
        allCaps: settings.allCaps,
      });

      result = await sharp(imageBuffer)
        .composite([{ input: svgBuffer }])
        .toBuffer();
    } else {
      result = await sharp(imageBuffer).toBuffer();
    }
  } catch (err) {
    throw await asInputErrorIfUndecodable(imageBuffer, err);
  }

  const outputMeta = await sharp(result).metadata();
  const detectedFormat = outputMeta.format ?? "png";
  const mimeMap: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };

  // Ensure the output filename extension matches the actual raster format
  // (e.g. SVG input produces a PNG buffer, so the name must end in .png).
  const extMap: Record<string, string> = {
    jpeg: ".jpg",
    png: ".png",
    webp: ".webp",
    gif: ".gif",
  };
  const correctExt = extMap[detectedFormat] ?? ".png";
  const currentExt = extname(filename);
  const baseName = currentExt ? filename.slice(0, -currentExt.length) : filename;
  const outFilename = `${baseName}${correctExt}`;

  return {
    buffer: result,
    filename: outFilename,
    contentType: mimeMap[detectedFormat] ?? "image/png",
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerMemeGenerator(app: FastifyInstance) {
  // Register process function for pipeline/batch compatibility
  registerToolProcessFn({
    toolId: "meme-generator",
    settingsSchema: settingsSchema as z.ZodType<unknown, z.ZodTypeDef, unknown>,
    process: withImageEncodeContext<unknown>(
      "Meme generation failed",
      (s) => (s as Settings)?.textLayout ?? "top-bottom",
      async (inputBuffer: Buffer, settings: unknown, filename: string) => {
        const parsed = settingsSchema.parse(settings);
        const buf = await prepareMemeImage(inputBuffer, filename);
        return processMeme(buf, parsed, filename);
      },
    ),
  });

  app.post("/api/v1/tools/image/meme-generator", async (request, reply) => {
    const contentTypeHeader = request.headers["content-type"] ?? "";
    const isMultipart = contentTypeHeader.includes("multipart/form-data");

    let imageBuffer: Buffer | null = null;
    let settingsRaw: unknown = null;
    let filename = "meme.png";

    // ── Parse request ───────────────────────────────────────────────
    if (isMultipart) {
      // Custom image mode: multipart with file + settings
      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            imageBuffer = Buffer.concat(chunks);
            if (part.filename) {
              filename = sanitizeFilename(part.filename);
            }
          } else if (part.type === "field" && part.fieldname === "settings") {
            try {
              settingsRaw = JSON.parse(part.value as string);
            } catch {
              return reply.status(400).send({ error: "Settings must be valid JSON" });
            }
          }
        }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }
    } else {
      // Template mode: JSON body
      settingsRaw = request.body;
    }

    // ── Validate settings ───────────────────────────────────────────
    const result = settingsSchema.safeParse(settingsRaw ?? {});
    if (!result.success) {
      return reply.status(400).send({
        error: "Invalid settings",
        details: formatZodErrors(result.error.issues),
      });
    }
    const settings = result.data;

    // ── Resolve image source ────────────────────────────────────────
    let templateTextBoxes: TemplateTextBox[] | undefined;

    if (settings.templateId) {
      // Template mode
      const template = findTemplate(settings.templateId);
      if (!template) {
        return reply.status(400).send({ error: `Template not found: ${settings.templateId}` });
      }

      const templatePath = join(TEMPLATES_DIR, "full", template.filename);
      if (!existsSync(templatePath)) {
        return reply.status(400).send({ error: `Template image not found: ${template.filename}` });
      }

      imageBuffer = readFileSync(templatePath);
      templateTextBoxes = template.textBoxes;
      filename = `meme-${template.id}.png`;
    } else if (!imageBuffer || imageBuffer.length === 0) {
      return reply.status(400).send({ error: "Either templateId or an image file is required" });
    }

    // ── Process ─────────────────────────────────────────────────────
    if (!imageBuffer) {
      return reply.status(400).send({ error: "No image provided" });
    }
    try {
      imageBuffer = await prepareMemeImage(imageBuffer, filename, request.log);
    } catch (err) {
      if (err instanceof InputValidationError) {
        return reply.status(400).send({
          error: err.message,
        });
      }
      if (isToolInputError(err)) {
        return reply.status(422).send({
          error: "Processing failed",
          details: stripInternalPaths(err.message),
        });
      }
      throw err;
    }

    try {
      const output = await processMeme(imageBuffer, settings, filename, templateTextBoxes);

      const jobId = randomUUID();
      await putObject(`outputs/${jobId}/${output.filename}`, output.buffer);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(output.filename)}`,
        originalSize: imageBuffer.length,
        processedSize: output.buffer.length,
      });
    } catch (err) {
      if (isDecoderUnavailable(err)) throw err;
      if (hasServerErrorStatus(err)) throw err;
      if (err instanceof InputValidationError) {
        return reply.status(400).send({
          error: err.message,
        });
      }
      if (!isToolInputError(err)) {
        request.log?.error({ err, toolId: "meme-generator" }, "Meme generation failed");
      }
      return reply.status(422).send({
        error: "Processing failed",
        details: stripInternalPaths(err instanceof Error ? err.message : "Meme generation failed"),
      });
    }
  });
}
