import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { vectorize as vtrace } from "@neplex/vectorizer";
import type { FastifyInstance } from "fastify";
import potrace from "potrace";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { putObject } from "../../lib/object-storage.js";
import { InputValidationError } from "../../modality/contract.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  colorMode: z.enum(["bw", "color"]).default("bw"),
  threshold: z.number().min(0).max(255).default(128),
  colorPrecision: z.number().min(1).max(16).default(6),
  layerDifference: z.number().min(1).max(128).default(6),
  filterSpeckle: z.number().min(1).max(256).default(4),
  pathMode: z.enum(["none", "polygon", "spline"]).default("spline"),
  cornerThreshold: z.number().min(0).max(180).default(60),
  invert: z.boolean().default(false),
});

function traceImage(
  buffer: Buffer,
  options: { threshold: number; turdSize: number; alphamax: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.trace(buffer, options, (err: Error | null, svg: string) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

// PathSimplifyMode: None=0, Polygon=1, Spline=2
const PATH_MODE_MAP: Record<string, number> = {
  none: 0,
  polygon: 1,
  spline: 2,
};

const ALPHA_MAX_MAP: Record<string, number> = {
  none: 0,
  polygon: 0.5,
  spline: 1,
};

async function vectorizeBuffer(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  filename: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  let buf = inputBuffer;

  if (settings.invert) {
    buf = await sharp(buf).negate({ alpha: false }).toBuffer();
  }

  let svg: string;

  if (settings.colorMode === "color") {
    const pngBuffer = await sharp(buf).png().toBuffer();
    svg = await vtrace(pngBuffer, {
      colorMode: 0,
      colorPrecision: settings.colorPrecision,
      filterSpeckle: settings.filterSpeckle,
      cornerThreshold: settings.cornerThreshold,
      layerDifference: settings.layerDifference,
      hierarchical: 0,
      mode: (PATH_MODE_MAP[settings.pathMode] ?? 2) as 0 | 1 | 2,
      lengthThreshold: 4,
      maxIterations: 2,
      spliceThreshold: 45,
      pathPrecision: 5,
    });
  } else {
    const pngBuffer = await sharp(buf).grayscale().png().toBuffer();
    svg = await traceImage(pngBuffer, {
      threshold: settings.threshold,
      turdSize: settings.filterSpeckle,
      alphamax: ALPHA_MAX_MAP[settings.pathMode] ?? 1,
    });
  }

  const svgBuffer = Buffer.from(svg, "utf-8");
  const baseName = filename.replace(/\.[^.]+$/, "");

  return {
    buffer: svgBuffer,
    filename: `${baseName}.svg`,
    contentType: "image/svg+xml",
  };
}

export function registerVectorize(app: FastifyInstance) {
  app.post("/api/v1/tools/image/vectorize", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "output";
    let settingsRaw: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          filename = sanitizeFilename(part.filename ?? "output");
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
      const prepared = await inputHandlerFor("image").prepare(fileBuffer, filename, {
        scratchDir: tmpdir(),
      });
      fileBuffer = prepared.buffer;
      filename = prepared.filename;

      const result = await vectorizeBuffer(fileBuffer, settings, filename);

      const jobId = randomUUID();
      await putObject(`outputs/${jobId}/${result.filename}`, result.buffer);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
        originalSize: fileBuffer.length,
        processedSize: result.buffer.length,
      });
    } catch (err) {
      if (err instanceof InputValidationError) {
        return reply.status(err.statusCode).send({ error: err.message, details: err.details });
      }
      return reply.status(422).send({
        error: "Vectorization failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  registerToolProcessFn({
    toolId: "vectorize",
    settingsSchema: settingsSchema as z.ZodType<unknown, z.ZodTypeDef, unknown>,
    process: vectorizeBuffer as (
      inputBuffer: Buffer,
      settings: unknown,
      filename: string,
    ) => Promise<{ buffer: Buffer; filename: string; contentType: string }>,
  });
}
