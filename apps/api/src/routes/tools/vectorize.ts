import { vectorize as vtrace } from "@neplex/vectorizer";
import type { FastifyInstance } from "fastify";
import potrace from "potrace";
import sharp from "sharp";
import { z } from "zod";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { createToolRoute } from "../tool-factory.js";

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

  let pngBuffer: Buffer;
  try {
    if (settings.invert) {
      // PNG: negating a GIF through its own palette traced inverted magenta as
      // 76,105,113 instead of green (#1190).
      buf = await sharp(buf).negate({ alpha: false }).png().toBuffer();
    }

    pngBuffer =
      settings.colorMode === "color"
        ? await sharp(buf).png().toBuffer()
        : await sharp(buf).grayscale().png().toBuffer();
  } catch (err) {
    throw await asInputErrorIfUndecodable(inputBuffer, err);
  }

  let svg: string;

  if (settings.colorMode === "color") {
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
  createToolRoute(app, {
    toolId: "vectorize",
    settingsSchema,
    process: withImageEncodeContext(
      "Image vectorization failed",
      (s) => s?.colorMode ?? "bw",
      vectorizeBuffer,
    ),
  });
}
