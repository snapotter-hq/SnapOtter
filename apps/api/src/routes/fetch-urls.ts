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
import { basename, extname } from "node:path";
import { hasServerErrorStatus } from "@snapotter/shared";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import PQueue from "p-queue";
import sharp from "sharp";
import { z } from "zod";
import { deleteRecordedToolJob, recordCompletedToolJob } from "../lib/completed-job.js";
import { reportEngineUnavailable } from "../lib/engine-unavailable.js";
import { reportError } from "../lib/error-report.js";
import { stripInternalPaths } from "../lib/errors.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { logger } from "../lib/logger.js";
import { deletePrefix, normalizeOperationalWriteError, putObject } from "../lib/object-storage.js";
import {
  FETCH_TIMEOUT_MS,
  MAX_URL_FETCH_SIZE,
  MAX_URLS_PER_REQUEST,
  safeFetch,
  URL_FETCH_CONCURRENCY,
} from "../lib/ssrf.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgzClientError,
  sanitizeSvg,
} from "../lib/svg-sanitize.js";
import { engineUnavailable } from "../modality/image-input.js";
import { getAuthUser } from "../plugins/auth.js";

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
export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = basename(pathname);
    // Decode percent-encoded characters
    const decoded = decodeURIComponent(base);
    // Only use it if it looks like a file with an extension before and after sanitizing
    if (
      extname(decoded).replace(/^\./, "") !== "" &&
      extname(sanitizeFilename(decoded)).replace(/^\./, "") !== "" &&
      decoded.length <= 255
    ) {
      return decoded;
    }
  } catch {
    // ignore parse errors
  }
  return `file-${randomUUID().slice(0, 8)}`;
}

/**
 * Return a filename that does not collide with any name already in `used`.
 * Appends `_1`, `_2`, etc. before the extension when a collision is found.
 * Mirrors the deduplication logic in batch.ts.
 */
export function getUniqueName(name: string, used: Set<string>): string {
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

function unverifiedMime(claimedMime: string): string {
  return claimedMime.toLowerCase().startsWith("image/") ? "application/octet-stream" : claimedMime;
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
      const userId = getAuthUser(request)?.id ?? null;

      let aborted = false;
      let recordedJob = false;
      let wroteUpload = false;
      let recordJobPromise: Promise<void> | null = null;

      const beforeWrite = async (firstOutputRef: string): Promise<void> => {
        if (!recordJobPromise) {
          recordJobPromise = recordCompletedToolJob({
            jobId,
            userId,
            toolId: "fetch-urls",
            outputRefs: [firstOutputRef],
          }).then(() => {
            recordedJob = true;
          });
        }
        await recordJobPromise;
      };

      const discardUploads = async () => {
        if (recordJobPromise) {
          await recordJobPromise.catch(() => {});
        }
        let prefixDeleted = true;
        if (wroteUpload) {
          wroteUpload = false;
          await deletePrefix(`uploads/${jobId}/`).catch((err) => {
            prefixDeleted = false;
            request.log.warn({ err, jobId }, "failed to discard a rejected request's uploads");
          });
        }
        if (recordedJob && prefixDeleted) {
          recordedJob = false;
          await deleteRecordedToolJob(jobId).catch((err) => {
            request.log.warn({ err, jobId }, "failed to delete a rejected request's job row");
          });
        }
      };

      const queue = new PQueue({ concurrency: URL_FETCH_CONCURRENCY });

      // Track filenames to prevent collisions when multiple URLs resolve to the
      // same name (e.g. https://a.com/photo.jpg and https://b.com/photo.jpg).
      const usedFilenames = new Set<string>();

      // Pre-allocate result slots to preserve order
      const resultSlots: FetchResult[] = new Array(urls.length);

      try {
        await Promise.all(
          urls.map((url, index) =>
            queue.add(async () => {
              resultSlots[index] = await fetchSingleUrl(url, jobId, usedFilenames, request.log, {
                isAborted: () => aborted,
                beforeWrite,
                markWrote: () => {
                  wroteUpload = true;
                },
              });
            }),
          ),
        );
      } catch (err) {
        aborted = true;
        queue.clear();
        await queue.onIdle().catch(() => {});
        await discardUploads();
        throw err;
      }

      return reply.send({ results: resultSlots });
    },
  );
}

interface FetchWriteHooks {
  isAborted?: () => boolean;
  beforeWrite?: (firstOutputRef: string) => Promise<void>;
  markWrote?: () => void;
}

async function fetchSingleUrl(
  url: string,
  jobId: string,
  usedFilenames: Set<string>,
  log: Pick<FastifyBaseLogger, "warn"> & Partial<Pick<FastifyBaseLogger, "error">> = logger,
  hooks?: FetchWriteHooks,
): Promise<FetchResult> {
  try {
    // Fetch with SSRF protection and timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await safeFetch(url, {
        signal: controller.signal,
        maxBytes: MAX_URL_FETCH_SIZE,
      });
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

    // Derive filename from URL, decompressing .svgz and sanitizing SVG content
    // before validation and storage so hostile DOCTYPE/script payloads are
    // stripped even when Sharp rejects the post-sanitized SVG.
    const rawFilename = filenameFromUrl(url);
    let safeName = sanitizeFilename(rawFilename);
    let safeBuffer: Buffer = buffer;
    const uploadExt = extname(safeName).toLowerCase();
    let isDecompressedSvg = false;
    if (uploadExt === ".svgz" || isSvgBuffer(buffer)) {
      try {
        if (uploadExt === ".svgz") {
          safeBuffer = decompressSvgz(buffer);
        }
        if (isSvgBuffer(safeBuffer)) {
          safeBuffer = sanitizeSvg(safeBuffer);
          if (uploadExt === ".svgz") {
            isDecompressedSvg = true;
          }
        }
      } catch (err) {
        if ((err as { message?: string })?.message?.includes("SVGZ file does not contain")) {
          log.warn(
            { err, filename: rawFilename },
            "Fetched .svgz file does not contain SVG, storing as opaque file",
          );
          safeBuffer = buffer;
        } else if (isSvgzClientError(err)) {
          log.warn({ err, filename: rawFilename }, "SVGZ decompression failed");
          return { success: false, url, error: (err as Error).message };
        } else {
          (log.error ?? log.warn).call(log, { err, filename: rawFilename }, "SVG sanitize failed");
          void reportError(err, {
            source: "http",
            route: "/api/v1/fetch-urls",
            method: "POST",
            statusCode: 500,
          });
          return { success: false, url, error: "Internal server error" };
        }
      }
    }

    if (isDecompressedSvg && safeName.toLowerCase().endsWith(".svgz")) {
      safeName = safeName.replace(/\.svgz$/i, ".svg");
    }
    const filename = getUniqueName(safeName, usedFilenames);

    // Try image validation; non-image media (audio/video/document/data) is
    // accepted and typed from the HTTP response so URL import works for every
    // modality. The consuming tool runs modality-specific validation at
    // process time, and SSRF + size limits still bound what can be fetched.
    const validation = await validateImageBuffer(safeBuffer, filename).catch(() => null);
    const isValidImage = validation?.valid === true && !validation.nameOnly;

    // Record a completed jobs row before the first write so the S3 TTL sweep
    // can expire the prefix (#3624).
    if (hooks?.isAborted?.()) {
      return { success: false, url, error: "Request aborted" };
    }
    const uploadKey = `uploads/${jobId}/${filename}`;
    await hooks?.beforeWrite?.(uploadKey);
    if (hooks?.isAborted?.()) {
      return { success: false, url, error: "Request aborted" };
    }

    // Save to object storage uploads prefix (raw fetched files)
    try {
      hooks?.markWrote?.();
      await putObject(uploadKey, safeBuffer);
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(rawErr);
      if (hasServerErrorStatus(err)) {
        throw err;
      }
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        statusCode: 500,
      });
    }

    const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim();
    const contentType = isValidImage
      ? (FORMAT_TO_MIME[validation.format] ?? "application/octet-stream")
      : unverifiedMime(responseContentType || "application/octet-stream");
    const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`;

    // Formats in CLI_DECODED_FORMATS (HEIC, RAW, PSD, TGA, ...) validate
    // successfully without Sharp ever decoding pixels: validateImageBuffer
    // reports width/height as 0 for them by design. Decode once here (to a
    // Sharp-compatible PNG buffer) so both the preview and the real
    // dimensions below can be computed from actual pixel data, the same
    // pre-processing every other Sharp-touching consumer of
    // validateImageBuffer() already does (image-input.ts, erase-object.ts,
    // user-files.ts thumbnails). Decode failure is non-fatal: skip preview
    // and keep the 0x0 dimensions for whatever edge case failed to decode.
    let decodedBuffer: Buffer | null = safeBuffer;
    let didDecode = false;
    if (isValidImage) {
      try {
        if (validation.format === "heif") {
          decodedBuffer = Buffer.from(await decodeHeic(safeBuffer));
          didDecode = true;
        } else if (needsCliDecode(validation.format)) {
          const fileExt = extname(filename).toLowerCase().replace(/^\./, "") || undefined;
          try {
            decodedBuffer = Buffer.from(
              await decodeToSharpCompat(safeBuffer, validation.format, fileExt),
            );
          } catch (rawDecodeErr) {
            const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
            if (
              decodeErr instanceof DecoderOutOfMemoryError ||
              (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
            ) {
              throw decodeErr;
            }
            // Sharp reads some TIFF-headed RAW files (such as .dng) itself;
            // only surface a CLI decode failure if Sharp cannot read it either.
            try {
              await sharp(safeBuffer).metadata();
              await sharp(safeBuffer).resize(1).raw().toBuffer();
            } catch (rawProbeErr) {
              const probeErr = asDecoderOutOfMemory(rawProbeErr);
              if (probeErr instanceof DecoderOutOfMemoryError) {
                throw probeErr;
              }
              throw decodeErr;
            }
          }
          didDecode = true;
        }
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
          reportEngineUnavailable(engineUnavailable(err), "fetch-urls", log);
        } else {
          log.warn(
            { err: rawErr, jobId, contentType },
            "preview generation failed; result has no renderable preview",
          );
        }
        // Decode failed: non-fatal, skip preview and keep the 0x0 fallback.
        decodedBuffer = null;
        didDecode = false;
      }
    }

    // Real dimensions for formats that just got decoded above; every other
    // valid format already has real width/height from validateImageBuffer.
    let width = isValidImage ? validation.width : undefined;
    let height = isValidImage ? validation.height : undefined;
    if (didDecode && decodedBuffer) {
      try {
        const metadata = await sharp(decodedBuffer).metadata();
        width = metadata.width ?? width;
        height = metadata.height ?? height;
      } catch {
        // Metadata read failed: non-fatal, keep the 0x0 fallback.
      }
    }

    // Generate a webp preview only for non-browser-native image formats.
    // Non-image media has no image preview; the UI shows a modality icon.
    // Runs against decodedBuffer so CLI-decoded formats (HEIC, RAW, PSD,
    // ...) produce a real preview instead of failing on the raw, undecoded
    // buffer.
    let previewUrl: string | null = null;
    if (decodedBuffer && isValidImage && !BROWSER_PREVIEWABLE.has(contentType)) {
      try {
        const previewBuffer = await sharp(decodedBuffer).webp({ quality: 80 }).toBuffer();
        if (!hooks?.isAborted?.()) {
          const previewFilename = `preview-${filename.replace(/\.[^.]+$/, "")}.webp`;
          await putObject(`uploads/${jobId}/${previewFilename}`, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/${encodeURIComponent(previewFilename)}`;
        }
      } catch (err) {
        const decoderErr = asDecoderOutOfMemory(err);
        if (isDecoderUnavailable(decoderErr)) {
          reportEngineUnavailable(engineUnavailable(decoderErr), "fetch-urls", log);
        } else {
          log.warn(
            { err, jobId, contentType },
            "preview generation failed; result has no renderable preview",
          );
        }
        // Preview generation failed: non-fatal, skip preview
      }
    }

    return {
      success: true,
      url,
      filename,
      contentType,
      size: safeBuffer.length,
      width,
      height,
      downloadUrl,
      previewUrl,
    };
  } catch (err) {
    if (hasServerErrorStatus(err)) {
      throw err;
    }
    const message = stripInternalPaths(err instanceof Error ? err.message : "Unknown error");
    return { success: false, url, error: message };
  }
}
