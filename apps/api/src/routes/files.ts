import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { pipeline, type Readable, Transform } from "node:stream";
import { hasServerErrorStatus, IMAGE_EXT_TO_MIME } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { deleteRecordedToolJob, recordCompletedToolJob } from "../lib/completed-job.js";
import { sendInputValidationError } from "../lib/engine-unavailable.js";
import { reportError } from "../lib/error-report.js";
import { stripInternalPaths } from "../lib/errors.js";
import { readImageDimensions } from "../lib/exiftool.js";
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
import { readFilePart } from "../lib/multipart-parts.js";
import {
  deletePrefix,
  getObjectSize,
  getObjectStream,
  isS3MissingShape,
  isStorageServiceFault,
  isValidObjectKey,
  normalizeOperationalWriteError,
  normalizeS3ReadFault,
  putObject,
  verifyS3Bucket,
} from "../lib/object-storage.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgClientError,
  isSvgzClientError,
  sanitizeSvg,
} from "../lib/svg-sanitize.js";
import { engineUnavailable } from "../modality/image-input.js";
import { requireFileAccess, requirePermission } from "../permissions.js";

/**
 * Guard against path traversal in URL params.
 */
export function isPathTraversal(segment: string): boolean {
  return (
    segment.includes("..") ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  );
}

/**
 * Stream a stored object to the client while verifying that the bytes delivered
 * match the declared Content-Length. When a storage backend's stat() size
 * disagrees with the bytes its read stream yields (issue #590 "cause 2"), a
 * stream shorter than the declared length leaves the browser hanging on
 * keep-alive framing, waiting for a tail that never arrives. That is the
 * "download starts but never finishes" symptom. Resetting the socket on a
 * shortfall turns that silent hang into an immediate, logged failure.
 *
 * The byte count lives inside a Transform, not a "data" listener on the piped
 * stream, so it never forces the source into flowing mode and always respects
 * backpressure: a slow or paused client is never mistaken for a stalled stream.
 */
function guardedDownloadStream(
  request: FastifyRequest,
  reply: FastifyReply,
  source: Readable,
  key: string,
  expectedBytes: number,
): Readable {
  let delivered = 0;
  const counted = new Transform({
    transform(chunk, _encoding, callback) {
      delivered += chunk.length;
      callback(null, chunk);
    },
  });
  // pipeline() forwards a source read error into `counted` (so Fastify tears the
  // response down instead of the client hanging on a half-sent body) and
  // destroys both streams if the client disconnects, so no source handle leaks.
  pipeline(source, counted, (err) => {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    // A premature close is the normal shape of a client cancelling a download.
    // Fastify already resets the response and logs a genuine source error; this
    // adds the object key it omits, at warn so it stays out of error tracking.
    if (err && code !== "ERR_STREAM_PREMATURE_CLOSE") {
      request.log.warn({ key, err }, "Download source stream failed before completing");
    }
  });
  counted.on("end", () => {
    // A stream that ends short of the declared length is what leaves the client
    // hanging on keep-alive framing; reset the socket so the download fails at
    // once instead of waiting for a tail that never arrives. An over-count does
    // not reach here (Node breaks the response as the extra bytes are written),
    // and it fails the client on its own, so a shortfall is the only case here.
    if (delivered < expectedBytes) {
      request.log.error(
        { key, declaredSize: expectedBytes, delivered },
        "Download stream ended short of the declared Content-Length; resetting connection",
      );
      reply.raw.destroy();
    }
  });
  return counted;
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/upload ────────────────────────────────────────
  app.post(
    "/api/v1/upload",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Persists bytes that /api/v1/download then serves without auth, so this
      // needs the same grant as the rest of the file surface. The tool-access
      // middleware only covers /api/v1/tools/, and never reached this route.
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const jobId = randomUUID();

      const uploadedFiles: Array<{
        name: string;
        size: number;
        format: string;
      }> = [];
      let recordedJob = false;
      let wroteUpload = false;
      const discardUploads = async () => {
        let prefixDeleted = true;
        if (wroteUpload) {
          wroteUpload = false;
          await deletePrefix(`outputs/${jobId}/`).catch((err) => {
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

      const parts = request.parts();

      try {
        for await (const part of parts) {
          // Skip non-file fields
          if (part.type !== "file") continue;

          // Consume buffer from the stream
          const buffer = await readFilePart(part.file);

          // Skip empty parts (e.g. empty file field)
          if (buffer.length === 0) continue;

          // Sanitize SVG uploads to prevent XXE, SSRF, and script injection.
          // Keyed on content, NOT on isValidImage: a hostile SVG (a DOCTYPE with
          // an external entity, say) makes Sharp fail validation, and gating the
          // sanitizer on a successful decode would store the payload untouched.
          // Throwing out of the multipart loop gets rewritten to a generic 400 by
          // the stream teardown, so handle it here like the quota check below:
          // return the sanitizer's reason for a size/element-cap rejection, and
          // report + 500 for anything unexpected rather than storing the file.
          // Sanitize filename (canonical; do NOT re-sanitize downstream)
          let safeName = sanitizeFilename(part.filename ?? "upload");
          let safeBuffer: Buffer = buffer;
          const uploadExt = extname(safeName).toLowerCase();
          let isDecompressedSvg = false;
          let sanitizedAsSvg = false;
          if (uploadExt === ".svgz" || isSvgBuffer(buffer)) {
            try {
              if (uploadExt === ".svgz") {
                safeBuffer = decompressSvgz(buffer);
              }
              if (isSvgBuffer(safeBuffer)) {
                safeBuffer = sanitizeSvg(safeBuffer);
                sanitizedAsSvg = true;
                if (uploadExt === ".svgz") {
                  isDecompressedSvg = true;
                }
              }
            } catch (err) {
              if ((err as { message?: string })?.message?.includes("SVGZ file does not contain")) {
                request.log.warn(
                  { err, filename: part.filename },
                  "Uploaded .svgz file does not contain SVG, storing as opaque file",
                );
                safeBuffer = buffer;
              } else if (isSvgzClientError(err)) {
                request.log.warn({ err, filename: part.filename }, "SVGZ decompression failed");
                await discardUploads();
                return reply.status(400).send({ error: (err as Error).message });
              } else {
                const oom = asDecoderOutOfMemory(err);
                if (oom instanceof DecoderOutOfMemoryError) throw oom;
                request.log.error({ err, filename: part.filename }, "SVG sanitize failed");
                void reportError(err, {
                  source: "http",
                  route: "/api/v1/upload",
                  method: "POST",
                  statusCode: 500,
                });
                await discardUploads();
                return reply.status(500).send({ error: "Internal server error" });
              }
            }
          }

          if (isDecompressedSvg && safeName.toLowerCase().endsWith(".svgz")) {
            safeName = safeName.replace(/\.svgz$/i, ".svg");
          }

          // Try image validation on the stored bytes; non-image files are accepted
          // with format from extension
          const validation = await validateImageBuffer(safeBuffer, safeName).catch((err) => {
            if (err instanceof DecoderOutOfMemoryError || hasServerErrorStatus(err)) throw err;
            request.log.warn({ err, filename: safeName }, "Image validation threw unexpectedly");
            return null;
          });
          const isValidImage = validation?.valid === true && !validation.nameOnly;

          if (!sanitizedAsSvg && isValidImage && validation.format === "svg") {
            try {
              safeBuffer = sanitizeSvg(decompressSvgz(safeBuffer));
              sanitizedAsSvg = true;
            } catch (err) {
              if (isSvgClientError(err)) {
                request.log.warn({ err, filename: part.filename }, "SVGZ decompression failed");
                await discardUploads();
                return reply.status(400).send({ error: (err as Error).message });
              }
              const oom = asDecoderOutOfMemory(err);
              if (oom instanceof DecoderOutOfMemoryError) throw oom;
              request.log.error({ err, filename: part.filename }, "SVG sanitize failed");
              void reportError(err, {
                source: "http",
                route: "/api/v1/upload",
                method: "POST",
                statusCode: 500,
              });
              await discardUploads();
              return reply.status(500).send({ error: "Internal server error" });
            }
          }

          // Record a completed jobs row before the first write so the S3 TTL
          // sweep can expire the prefix (#3624).
          const uploadKey = `outputs/${jobId}/${safeName}`;
          if (!recordedJob) {
            await recordCompletedToolJob({
              jobId,
              userId: user.id ?? null,
              toolId: "upload",
              outputRefs: [uploadKey],
            });
            recordedJob = true;
          }

          // Write to the outputs prefix: /api/v1/download serves outputs/ only,
          // never the raw tool inputs under uploads/.
          wroteUpload = true;
          await putObject(uploadKey, safeBuffer);

          const fileExt = extname(safeName).toLowerCase().replace(/^\./, "");
          uploadedFiles.push({
            name: safeName,
            size: safeBuffer.length,
            format: isValidImage ? validation.format : fileExt,
          });
        }
      } catch (err) {
        await discardUploads();
        throw err;
      }

      if (uploadedFiles.length === 0) {
        return reply.status(400).send({ error: "No valid files uploaded" });
      }

      return reply.send({
        jobId,
        files: uploadedFiles,
      });
    },
  );

  // ── GET /api/v1/download/:jobId/:filename ──────────────────────
  app.get(
    "/api/v1/download/:jobId/:filename",
    async (
      request: FastifyRequest<{
        Params: { jobId: string; filename: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { jobId, filename } = request.params;

      // Guard against path traversal
      if (isPathTraversal(jobId) || isPathTraversal(filename)) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      // A key that cannot name a stored object (URL-decoded garbage that
      // passes the traversal guard) keeps its long-standing 404 without
      // touching storage; past this point a probe failure is meaningful.
      if (!isValidObjectKey(`outputs/${jobId}/${filename}`)) {
        return reply.status(404).send({ error: "File not found" });
      }

      // A size-probe or stream-open rejection is only a miss when storage
      // says the object is not there (ENOENT, S3 NoSuchKey/404) or when the
      // client supplied a filename exceeding the filesystem limit
      // (ENAMETOOLONG, since maxParamLength: 500 exceeds 255 bytes). Every
      // other local or S3 fault (EACCES, ENOTDIR, ERR_FS_FILE_TOO_LARGE,
      // AccessDenied, rotated credentials, S3 5xx) must reach the global
      // handler and Sentry rather than fold into "File not found" (#974,
      // #2808, #2851).
      const rethrowIfStorageFault = (e: unknown): void => {
        if (isStorageServiceFault(e)) throw normalizeS3ReadFault(e);
        if (isS3MissingShape(e)) return;
        const { code } = (e ?? {}) as NodeJS.ErrnoException;
        if (code === "ENOENT" || code === "ENAMETOOLONG") return;
        throw e;
      };

      // Resolve from object storage outputs/ only: never fall back to uploads/,
      // which holds raw unprocessed tool inputs under the same jobId.
      const key = `outputs/${jobId}/${filename}`;
      let size: number;
      try {
        size = await getObjectSize(key);
      } catch (outputsErr) {
        rethrowIfStorageFault(outputsErr);
        await verifyS3Bucket();
        request.log.warn({ jobId, filename }, "result download: object missing in storage");
        return reply.status(404).send({ error: "File not found" });
      }

      const ext = extname(filename).toLowerCase().replace(/^\./, "");
      const contentType = getContentType(ext);

      // Check Range header before setting content headers (a 416 must not
      // carry the attachment Content-Type that would confuse serialization).
      reply.header("Accept-Ranges", "bytes");
      // Tell nginx (and compatible reverse proxies) not to buffer the download.
      // A buffering proxy in front of a self-hosted install is the usual cause
      // of a download that "starts but never finishes"; the app itself always
      // delivers exactly Content-Length bytes. Mirrors the SSE route (#590).
      reply.header("X-Accel-Buffering", "no");

      const range = request.headers.range;
      let byteRange: { start: number; end: number } | undefined;
      if (range) {
        const m = range.match(/^bytes=(\d+)-(\d*)$/);
        const start = m ? Number.parseInt(m[1], 10) : Number.NaN;
        const end = m?.[2] ? Number.parseInt(m[2], 10) : size - 1;
        if (!m || Number.isNaN(start) || start >= size || end < start) {
          return reply
            .code(416)
            .header("Content-Range", `bytes */${size}`)
            .send({ error: "Range not satisfiable" });
        }
        byteRange = { start, end: Math.min(end, size - 1) };
      }

      // Open the stream before setting attachment headers (#997). If the blob
      // vanished or became unreadable after the size probe above, an already-set
      // Content-Type or Content-Disposition would either pollute the 404/500 or
      // make the error handler fail JSON serialization.
      let stream: Readable;
      try {
        stream = await getObjectStream(key, byteRange);
      } catch (streamErr) {
        rethrowIfStorageFault(streamErr);
        request.log.warn({ jobId, filename }, "result download: object missing in storage");
        return reply.status(404).send({ error: "File not found" });
      }

      const contentDisposition = `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
      if (byteRange) {
        const rangeLength = byteRange.end - byteRange.start + 1;
        return reply
          .code(206)
          .header("Content-Type", contentType)
          .header("Content-Disposition", contentDisposition)
          .header("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${size}`)
          .header("Content-Length", String(rangeLength))
          .send(guardedDownloadStream(request, reply, stream, key, rangeLength));
      }

      reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", contentDisposition)
        .header("Content-Length", String(size));
      return reply.send(guardedDownloadStream(request, reply, stream, key, size));
    },
  );

  // ── POST /api/v1/preview ──────────────────────────────────────
  // Returns a WebP preview for formats browsers can't display (HEIC/HEIF).
  app.post("/api/v1/preview", async (request: FastifyRequest, reply: FastifyReply) => {
    // Decodes attacker-supplied bytes through Sharp, libheif and LibRaw on behalf
    // of the tool workflow, so it belongs behind the same grant as running a tool.
    if (!(await requirePermission("tools:use")(request, reply))) return;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }
    const originalBuffer = await data.toBuffer().catch((err) => {
      throw asDecoderOutOfMemory(err);
    });
    let buffer = originalBuffer;
    const ext = data.filename
      ? extname(data.filename).toLowerCase().replace(/^\./, "") || undefined
      : undefined;

    let validation: Awaited<ReturnType<typeof validateImageBuffer>>;
    try {
      validation = await validateImageBuffer(buffer, data.filename);
    } catch (rawErr) {
      const err = asDecoderOutOfMemory(rawErr);
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
        return sendInputValidationError(reply, engineUnavailable(err), "file-preview", request.log);
      }
      throw rawErr;
    }
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.reason });
    }

    // Decode HEIC/HEIF via system decoder
    if (validation.format === "heif") {
      try {
        buffer = await decodeHeic(buffer);
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "file-preview",
            request.log,
          );
        }
        request.log.warn({ err, toolId: "file-preview" }, "Decode failed");
        return reply.status(422).send({
          error: "Failed to decode HEIC/HEIF file",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }
    }

    // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools
    let fallbackFormat: string | undefined;
    if (needsCliDecode(validation.format)) {
      try {
        buffer = await decodeToSharpCompat(buffer, validation.format, ext);
      } catch (rawDecodeErr) {
        const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
        if (
          decodeErr instanceof DecoderOutOfMemoryError ||
          (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
        ) {
          return sendInputValidationError(
            reply,
            engineUnavailable(decodeErr),
            "file-preview",
            request.log,
          );
        }
        // CLI decoder unavailable: try Sharp directly as fallback for preview
        try {
          const meta = await sharp(buffer).metadata();
          fallbackFormat = meta.format;
          if (fallbackFormat !== "svg") {
            await sharp(buffer).resize(1).raw().toBuffer();
          }
        } catch (rawProbeErr) {
          const probeErr = asDecoderOutOfMemory(rawProbeErr);
          if (probeErr instanceof DecoderOutOfMemoryError) {
            return sendInputValidationError(
              reply,
              engineUnavailable(probeErr),
              "file-preview",
              request.log,
            );
          }
          if (isDecoderUnavailable(decodeErr) || hasServerErrorStatus(decodeErr)) {
            return sendInputValidationError(
              reply,
              engineUnavailable(decodeErr),
              "file-preview",
              request.log,
            );
          }
          request.log?.warn({ err: decodeErr, toolId: "file-preview" }, "Decode failed");
          return reply.status(422).send({
            error: `Failed to decode ${validation.format.toUpperCase()} file`,
            details: stripInternalPaths(
              decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
            ),
          });
        }
      }
    }

    if (validation.format === "svg" || fallbackFormat === "svg") {
      try {
        buffer = decompressSvgz(buffer);
        buffer = sanitizeSvg(buffer);
      } catch (rawErr) {
        if (isSvgClientError(rawErr)) {
          return reply.status(400).send({
            error: rawErr instanceof Error ? rawErr.message : "Invalid SVG",
          });
        }
        const err = asDecoderOutOfMemory(rawErr);
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "file-preview",
            request.log,
          );
        }
        throw rawErr;
      }
    }

    try {
      const preMeta = await sharp(buffer).metadata();
      let origWidth = preMeta.width ?? 0;
      let origHeight = preMeta.height ?? 0;

      if (validation.format === "raw" && fallbackFormat !== "svg") {
        const dims = await readImageDimensions(originalBuffer, ext);
        if (dims) {
          origWidth = dims.width;
          origHeight = dims.height;
        }
      }

      const webp = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return reply
        .header("Content-Type", "image/webp")
        .header("X-Original-Width", String(origWidth))
        .header("X-Original-Height", String(origHeight))
        .send(webp);
    } catch (rawErr) {
      const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
      if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
        return sendInputValidationError(reply, engineUnavailable(err), "file-preview", request.log);
      }
      return reply.status(422).send({
        error: `Failed to generate preview for ${validation.format.toUpperCase()} file`,
      });
    }
  });
}

export function getContentType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    zip: "application/zip",
    json: "application/json",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    html: "text/html",
    htm: "text/html",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    "3gp": "video/3gpp",
    flv: "video/x-flv",
    wmv: "video/x-ms-wmv",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
    ts: "video/mp2t",
    mts: "video/mp2t",
    m2ts: "video/mp2t",
    ogv: "video/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    opus: "audio/opus",
    wma: "audio/x-ms-wma",
    aiff: "audio/aiff",
    amr: "audio/amr",
    ac3: "audio/ac3",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odp: "application/vnd.oasis.opendocument.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    epub: "application/epub+zip",
    srt: "application/x-subrip",
    vtt: "text/vtt",
  };
  const type = map[ext] ?? IMAGE_EXT_TO_MIME[ext] ?? "application/octet-stream";
  // Text payloads (extracted text, markdown, CSV, subtitles) are written UTF-8.
  // Without an explicit charset a browser can sniff a legacy encoding and
  // mojibake non-Latin scripts like Arabic when the file is viewed inline (#589).
  return type.startsWith("text/") ? `${type}; charset=utf-8` : type;
}
