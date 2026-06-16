/**
 * Fetch URLs route.
 *
 * POST /api/v1/fetch-urls
 *
 * Accepts a JSON body with { urls: string[] } (1-50 URLs).
 * Fetches each URL server-side with SSRF protection, validates as an image,
 * saves to object storage, generates a preview for non-browser formats, and
 * returns results with download URLs.
 */
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { FastifyInstance } from "fastify";
import PQueue from "p-queue";
import sharp from "sharp";
import { z } from "zod";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { putObject } from "../lib/object-storage.js";
import {
  FETCH_TIMEOUT_MS,
  MAX_URL_FETCH_SIZE,
  MAX_URLS_PER_REQUEST,
  safeFetch,
  URL_FETCH_CONCURRENCY,
} from "../lib/ssrf.js";

/** Formats browsers can display natively (no preview needed). */
const BROWSER_PREVIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
]);

/** Map detected format string to MIME type. */
const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  tiff: "image/tiff",
  heif: "image/heic",
  jxl: "image/jxl",
  ico: "image/x-icon",
  psd: "image/vnd.adobe.photoshop",
  raw: "image/x-dcraw",
  tga: "image/x-tga",
  exr: "image/x-exr",
  hdr: "image/vnd.radiance",
  jp2: "image/jp2",
  qoi: "image/x-qoi",
  eps: "application/postscript",
  dds: "image/x-dds",
  cur: "image/x-icon",
  dpx: "image/x-dpx",
  fits: "image/fits",
  ppm: "image/x-portable-pixmap",
  pgm: "image/x-portable-graymap",
  pbm: "image/x-portable-bitmap",
  pfm: "image/x-portable-floatmap",
};

const fetchUrlsSchema = z.object({
  urls: z
    .array(z.string().url("Each entry must be a valid URL"))
    .min(1, "At least one URL is required")
    .max(MAX_URLS_PER_REQUEST, `Maximum ${MAX_URLS_PER_REQUEST} URLs per request`),
});

interface SuccessResult {
  success: true;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  downloadUrl: string;
  previewUrl: string | null;
}

interface FailureResult {
  success: false;
  url: string;
  error: string;
}

type FetchResult = SuccessResult | FailureResult;

/**
 * Extract a usable filename from a URL path, falling back to a UUID-based name.
 */
function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = basename(pathname);
    // Decode percent-encoded characters
    const decoded = decodeURIComponent(base);
    // Only use it if it looks like a file with an extension
    if (decoded?.includes(".") && decoded.length <= 255) {
      return decoded;
    }
  } catch {
    // ignore parse errors
  }
  return `image-${randomUUID().slice(0, 8)}`;
}

/**
 * Return a filename that does not collide with any name already in `used`.
 * Appends `_1`, `_2`, etc. before the extension when a collision is found.
 * Mirrors the deduplication logic in batch.ts.
 */
function getUniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
  let counter = 1;
  let candidate = `${base}_${counter}${ext}`;
  while (used.has(candidate)) {
    counter++;
    candidate = `${base}_${counter}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function registerFetchUrlsRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/fetch-urls",
    { config: { rateLimit: { max: 200, timeWindow: "1 hour" } } },
    async (request, reply) => {
      // Validate body
      const parsed = fetchUrlsSchema.safeParse(request.body);
      if (!parsed.success) {
        const messages = parsed.error.issues.map((i) => i.message).join("; ");
        return reply.status(400).send({ error: messages });
      }

      const { urls } = parsed.data;
      const jobId = randomUUID();

      const queue = new PQueue({ concurrency: URL_FETCH_CONCURRENCY });

      // Track filenames to prevent collisions when multiple URLs resolve to the
      // same name (e.g. https://a.com/photo.jpg and https://b.com/photo.jpg).
      const usedFilenames = new Set<string>();

      // Pre-allocate result slots to preserve order
      const resultSlots: FetchResult[] = new Array(urls.length);

      await Promise.all(
        urls.map((url, index) =>
          queue.add(async () => {
            resultSlots[index] = await fetchSingleUrl(url, jobId, usedFilenames);
          }),
        ),
      );

      return reply.send({ results: resultSlots });
    },
  );
}

async function fetchSingleUrl(
  url: string,
  jobId: string,
  usedFilenames: Set<string>,
): Promise<FetchResult> {
  try {
    // Fetch with SSRF protection and timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await safeFetch(url, controller.signal);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        success: false,
        url,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Read body with size limit
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    if (!response.body) {
      return { success: false, url, error: "Empty response body" };
    }

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.byteLength;
        if (totalSize > MAX_URL_FETCH_SIZE) {
          reader.cancel();
          return {
            success: false,
            url,
            error: `File exceeds maximum size of ${MAX_URL_FETCH_SIZE / (1024 * 1024)}MB`,
          };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return { success: false, url, error: "Empty response body" };
    }

    // Derive filename from URL, deduplicating to prevent overwrites when
    // multiple URLs resolve to the same name (all URLs share one workspace).
    const rawFilename = filenameFromUrl(url);
    const filename = getUniqueName(sanitizeFilename(rawFilename), usedFilenames);

    // Try image validation; non-image media (audio/video/document/data) is
    // accepted and typed from the HTTP response so URL import works for every
    // modality. The consuming tool runs modality-specific validation at
    // process time, and SSRF + size limits still bound what can be fetched.
    const validation = await validateImageBuffer(buffer, filename).catch(() => null);

    // Save to object storage uploads prefix (raw fetched files)
    await putObject(`uploads/${jobId}/${filename}`, buffer);

    const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim();
    const contentType = validation?.valid
      ? (FORMAT_TO_MIME[validation.format] ?? "application/octet-stream")
      : responseContentType || "application/octet-stream";
    const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`;

    // Generate a webp preview only for non-browser-native image formats.
    // Non-image media has no image preview; the UI shows a modality icon.
    let previewUrl: string | null = null;
    if (validation?.valid && !BROWSER_PREVIEWABLE.has(contentType)) {
      try {
        const previewBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
        const previewFilename = `preview-${filename.replace(/\.[^.]+$/, "")}.webp`;
        await putObject(`uploads/${jobId}/${previewFilename}`, previewBuffer);
        previewUrl = `/api/v1/download/${jobId}/${encodeURIComponent(previewFilename)}`;
      } catch {
        // Preview generation failed -- non-fatal, skip preview
      }
    }

    return {
      success: true,
      url,
      filename,
      contentType,
      size: buffer.length,
      width: validation?.valid ? validation.width : undefined,
      height: validation?.valid ? validation.height : undefined,
      downloadUrl,
      previewUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, url, error: message };
  }
}
