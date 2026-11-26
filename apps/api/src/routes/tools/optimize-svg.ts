import { ToolInputError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import type { Config } from "svgo";
import { z } from "zod";
import {
  runInWorker,
  WorkerOutOfMemoryError,
  WorkerTimeoutError,
} from "../../lib/run-in-worker.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgClientError,
  sanitizeSvg,
} from "../../lib/svg-sanitize.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

export const settingsSchema = z.object({
  precision: z.number().int().min(0).max(8).default(3),
  multipass: z.boolean().default(true),
  removeMetadata: z.boolean().default(true),
  pretty: z.boolean().default(false),
});

type OptimizeSvgSettings = z.infer<typeof settingsSchema>;

const NOT_SVG_MESSAGE = "Optimize SVG only accepts SVG or SVGZ files";
const IMAGE_UNDECODABLE = "IMAGE_UNDECODABLE";
const SVG_TOO_LARGE = "SVG_TOO_LARGE";

/**
 * svgo is synchronous JavaScript, so it runs on a worker thread with a
 * deadline (see svgo-worker.mjs) and can't stall the API process. The byte cap
 * and the timeout are backstops, not the event-loop guard: about a second per
 * MB of path data with multipass on, so 10 MB finishes well inside 30 s on a
 * modern host and a slow one is cut off instead of hanging.
 */
export const MAX_OPTIMIZE_SVG_BYTES = 10 * 1024 * 1024;
export const OPTIMIZE_SVG_TIMEOUT_MS = 30_000;
const OPTIMIZE_SVG_WORKER_HEAP_MB = 512;
const SVGO_WORKER_URL = new URL("../../lib/svgo-worker.mjs", import.meta.url);
const TOO_COMPLEX_MESSAGE = "SVG is too complex to optimize within the time limit";
const TOO_LARGE_MESSAGE = `SVG exceeds the ${MAX_OPTIMIZE_SVG_BYTES / 1024 / 1024} MB optimize limit`;

/** The sanitizer's size, element and nesting caps are client errors; anything else is ours. */
function sanitizeOrReject(svg: Buffer): Buffer {
  try {
    return sanitizeSvg(svg);
  } catch (err) {
    if (isSvgClientError(err) && err instanceof Error) {
      throw new ToolInputError(err.message, { cause: err, code: SVG_TOO_LARGE });
    }
    throw err;
  }
}

function svgoConfig(settings: OptimizeSvgSettings): Config {
  // preset-default in svgo 4 already keeps viewBox and <title>, so scaling
  // and accessible names survive without overrides.
  const overrides = settings.removeMetadata
    ? {}
    : {
        removeComments: false as const,
        removeMetadata: false as const,
        removeDesc: false as const,
        removeEditorsNSData: false as const,
      };
  return {
    multipass: settings.multipass,
    floatPrecision: settings.precision,
    js2svg: { pretty: settings.pretty, indent: 2 },
    plugins: [{ name: "preset-default", params: { overrides } }],
  };
}

/** Inflate .svgz and run the sanitizer, answering a client error for anything that isn't SVG. */
function sanitizedSvgInput(buffer: Buffer): Buffer {
  let svg: Buffer;
  try {
    svg = decompressSvgz(buffer);
  } catch (err) {
    if (isSvgClientError(err)) {
      throw new ToolInputError(NOT_SVG_MESSAGE, { cause: err, code: IMAGE_UNDECODABLE });
    }
    throw err;
  }
  if (!isSvgBuffer(svg)) throw new ToolInputError(NOT_SVG_MESSAGE, { code: IMAGE_UNDECODABLE });
  if (svg.length > MAX_OPTIMIZE_SVG_BYTES) {
    throw new ToolInputError(TOO_LARGE_MESSAGE, { code: SVG_TOO_LARGE });
  }
  return sanitizeOrReject(svg);
}

/** Runs svgo off the event loop; a job that overruns the deadline or the heap is a client-size error. */
export async function optimizeOnWorker(
  svg: string,
  config: Config,
  timeoutMs = OPTIMIZE_SVG_TIMEOUT_MS,
): Promise<string> {
  try {
    return await runInWorker<string>(
      SVGO_WORKER_URL,
      { svg, config },
      { timeoutMs, maxOldGenerationSizeMb: OPTIMIZE_SVG_WORKER_HEAP_MB },
    );
  } catch (err) {
    if (err instanceof WorkerTimeoutError || err instanceof WorkerOutOfMemoryError) {
      throw new ToolInputError(TOO_COMPLEX_MESSAGE, { cause: err, code: SVG_TOO_LARGE });
    }
    throw err;
  }
}

export async function optimizeSvgBuffer(
  inputBuffer: Buffer,
  settings: OptimizeSvgSettings,
  filename: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const input = sanitizedSvgInput(inputBuffer);

  let optimized: string;
  try {
    optimized = await optimizeOnWorker(input.toString("utf-8"), svgoConfig(settings));
  } catch (err) {
    // svgo doesn't export SvgoParserError, so match it by name.
    if (err instanceof Error && err.name === "SvgoParserError") {
      throw new ToolInputError("The SVG could not be parsed", {
        cause: err,
        code: IMAGE_UNDECODABLE,
      });
    }
    throw err;
  }

  // svgo can inline styles and rewrite references, so the output goes back
  // through the sanitizer like any other SVG we hand out.
  const buffer = sanitizeOrReject(Buffer.from(optimized, "utf-8"));
  const baseName = filename.replace(/\.svgz?$/i, "");
  return { buffer, filename: `${baseName}.svg`, contentType: "image/svg+xml" };
}

export function registerOptimizeSvg(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "optimize-svg",
    settingsSchema,
    // The image handler accepts any image and any SVG up to MAX_SVG_SIZE_MB,
    // so refuse a raster or an oversized SVG here instead of in the worker.
    preValidate: ({ inputs }) => {
      const svg = inputs[0].buffer;
      if (!isSvgBuffer(svg)) {
        throw new InputValidationError(NOT_SVG_MESSAGE, 400, undefined, IMAGE_UNDECODABLE);
      }
      if (svg.length > MAX_OPTIMIZE_SVG_BYTES) {
        throw new InputValidationError(TOO_LARGE_MESSAGE, 400, undefined, SVG_TOO_LARGE);
      }
    },
    process: (inputBuffer, settings, filename) =>
      optimizeSvgBuffer(inputBuffer, settings, filename),
  });
}
