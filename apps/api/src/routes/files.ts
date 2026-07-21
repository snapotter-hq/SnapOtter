import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { pipeline, type Readable, Transform } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { readImageDimensions } from "../lib/exiftool.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { getObjectSize, getObjectStream, putObject } from "../lib/object-storage.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";

/**
 * Guard against path traversal in URL params.
 */
function isPathTraversal(segment: string): boolean {
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
      const jobId = randomUUID();

      const uploadedFiles: Array<{
        name: string;
        size: number;
        format: string;
      }> = [];

      const parts = request.parts();

      for await (const part of parts) {
        // Skip non-file fields
        if (part.type !== "file") continue;

        // Consume buffer from the stream
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Skip empty parts (e.g. empty file field)
        if (buffer.length === 0) continue;

        // Try image validation; non-image files are accepted with format from extension
        const validation = await validateImageBuffer(buffer, part.filename).catch(() => null);
        const isValidImage = validation?.valid === true;

        // Sanitize SVG uploads to prevent XXE, SSRF, and script injection
        const safeBuffer = isValidImage && isSvgBuffer(buffer) ? sanitizeSvg(buffer) : buffer;

        // Sanitize filename (canonical; do NOT re-sanitize downstream)
        const safeName = sanitizeFilename(part.filename ?? "upload");

        // Write to object storage uploads prefix
        await putObject(`uploads/${jobId}/${safeName}`, safeBuffer);

        const fileExt = safeName.split(".").pop()?.toLowerCase() ?? "";
        uploadedFiles.push({
          name: safeName,
          size: safeBuffer.length,
          format: isValidImage ? validation.format : fileExt,
        });
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

      // Resolve from object storage: outputs/ first, then uploads/
      let key = `outputs/${jobId}/${filename}`;
      let size: number;
      try {
        size = await getObjectSize(key);
      } catch {
        key = `uploads/${jobId}/${filename}`;
        try {
          size = await getObjectSize(key);
        } catch {
          return reply.status(404).send({ error: "File not found" });
        }
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
        const clampedEnd = Math.min(end, size - 1);
        return reply
          .code(206)
          .header("Content-Type", contentType)
          .header(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          )
          .header("Content-Range", `bytes ${start}-${clampedEnd}/${size}`)
          .header("Content-Length", String(clampedEnd - start + 1))
          .send(
            guardedDownloadStream(
              request,
              reply,
              await getObjectStream(key, { start, end: clampedEnd }),
              key,
              clampedEnd - start + 1,
            ),
          );
      }

      reply
        .header("Content-Type", contentType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .header("Content-Length", String(size));
      return reply.send(
        guardedDownloadStream(request, reply, await getObjectStream(key), key, size),
      );
    },
  );

  // ── POST /api/v1/preview ──────────────────────────────────────
  // Returns a WebP preview for formats browsers can't display (HEIC/HEIF).
  app.post("/api/v1/preview", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }
    const originalBuffer = await data.toBuffer();
    let buffer = originalBuffer;
    const ext = data.filename?.split(".").pop()?.toLowerCase();

    const validation = await validateImageBuffer(buffer, data.filename);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.reason });
    }

    // Decode HEIC/HEIF via system decoder
    if (validation.format === "heif") {
      try {
        buffer = await decodeHeic(buffer);
      } catch {
        return reply.status(422).send({ error: "Failed to decode HEIC/HEIF file" });
      }
    }

    // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools
    if (needsCliDecode(validation.format)) {
      try {
        buffer = await decodeToSharpCompat(buffer, validation.format);
      } catch {
        // CLI decoder unavailable -- try Sharp directly as fallback for preview
        try {
          await sharp(buffer).metadata();
        } catch {
          return reply.status(422).send({
            error: `Failed to decode ${validation.format.toUpperCase()} file`,
          });
        }
      }
    }

    try {
      const preMeta = await sharp(buffer).metadata();
      let origWidth = preMeta.width ?? 0;
      let origHeight = preMeta.height ?? 0;

      if (validation.format === "raw") {
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
    } catch {
      return reply.status(422).send({
        error: `Failed to generate preview for ${validation.format.toUpperCase()} file`,
      });
    }
  });
}

export function getContentType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    ico: "image/x-icon",
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
    jxl: "image/jxl",
    dng: "image/x-adobe-dng",
    cr2: "image/x-canon-cr2",
    nef: "image/x-nikon-nef",
    arw: "image/x-sony-arw",
    orf: "image/x-olympus-orf",
    rw2: "image/x-panasonic-rw2",
    tga: "image/x-tga",
    psd: "image/vnd.adobe.photoshop",
    exr: "image/x-exr",
    hdr: "image/vnd.radiance",
    heic: "image/heic",
    heif: "image/heif",
  };
  const type = map[ext] ?? "application/octet-stream";
  // Text payloads (extracted text, markdown, CSV, subtitles) are written UTF-8.
  // Without an explicit charset a browser can sniff a legacy encoding and
  // mojibake non-Latin scripts like Arabic when the file is viewed inline (#589).
  return type.startsWith("text/") ? `${type}; charset=utf-8` : type;
}
