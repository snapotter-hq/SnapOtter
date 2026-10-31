/**
 * User file library CRUD routes.
 *
 * GET    /api/v1/files              — List latest files (one per version chain)
 * POST   /api/v1/files/upload       — Upload one or more image files
 * GET    /api/v1/files/:id          — File details + full version history
 * GET    /api/v1/files/:id/download — Stream file as attachment
 * GET    /api/v1/files/:id/thumbnail — 300px JPEG thumbnail on-the-fly
 * DELETE /api/v1/files              — Bulk delete entire version chains
 * POST   /api/v1/files/save-result  — Save a tool processing result (new version)
 */
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  hasServerErrorStatus,
  IMAGE_EXT_TO_MIME,
  isSafeMessageError,
  SafeError,
} from "@snapotter/shared";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import { sendInputValidationError } from "../lib/engine-unavailable.js";
import { reportError } from "../lib/error-report.js";
import {
  deleteStoredFile,
  getCachedThumbnail,
  isStorageServiceFault,
  readStoredFile,
  saveFile,
  saveThumbnail,
  streamStoredFile,
} from "../lib/file-storage.js";
import {
  type ValidationResult,
  validatedImageMime,
  validateImageBuffer,
} from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { deleteLibraryFileStorage } from "../lib/library-cleanup.js";
import { readFilePart } from "../lib/multipart-parts.js";
import {
  isS3MissingShape,
  normalizeOperationalWriteError,
  normalizeS3ReadFault,
} from "../lib/object-storage.js";
import { quotaRefusal } from "../lib/quota.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgClientError,
  isSvgzClientError,
  sanitizeSvg,
} from "../lib/svg-sanitize.js";
import { engineUnavailable } from "../modality/image-input.js";
import {
  isPreviewServerFault,
  pdfFirstPagePreview,
  videoPosterPreview,
} from "../modality/preview.js";
import { hasEffectivePermission, requireFileAccess } from "../permissions.js";

// ── Helpers ────────────────────────────────────────────────────────

export const deleteFilesSchema = z.object({
  ids: z.array(z.string()).min(1, "ids must be a non-empty array of strings"),
});

export function extToMime(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odp: "application/vnd.oasis.opendocument.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    zip: "application/zip",
    srt: "application/x-subrip",
    vtt: "text/vtt",
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
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
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/opus",
    wma: "audio/x-ms-wma",
    aiff: "audio/aiff",
    amr: "audio/amr",
    ac3: "audio/ac3",
  };
  return map[clean] ?? IMAGE_EXT_TO_MIME[clean] ?? "application/octet-stream";
}

/**
 * The MIME type to store for a file that didn't validate as an image, given
 * the type it claims (the client's part header, or one read off its name).
 *
 * Only validateImageBuffer() can vouch for an image type, so an image/* claim
 * for bytes that failed it becomes application/octet-stream (#1349). Any other
 * claim is kept: video, audio, PDF and Office files have no sniff here, and
 * their previews branch on that type.
 */
export function unverifiedMime(claimedMime: string): string {
  return claimedMime.startsWith("image/") ? "application/octet-stream" : claimedMime;
}

export function thumbnailContentType(mimeType: string): "image/webp" | "image/png" | "image/jpeg" {
  if (mimeType.startsWith("video/")) return "image/webp";
  if (mimeType === "application/pdf") return "image/png";
  return "image/jpeg";
}

/**
 * The width/height to store for a validated image, or null if they weren't
 * actually measured.
 *
 * validateImageBuffer() reports {width: 0, height: 0} by design for
 * CLI_DECODED_FORMATS members (HEIC, RAW, PSD, TGA, ...): it intentionally
 * skips decoding on upload, so 0 there means "unknown", not a real size.
 * 0x0 is never a genuine image dimension, so treat it the same as an
 * invalid/failed validation and store null instead of the literal 0.
 */
export function measuredDimensions(validation: ValidationResult | null): {
  width: number | null;
  height: number | null;
} {
  if (!validation) return { width: null, height: null };
  return {
    width: validation.width > 0 ? validation.width : null,
    height: validation.height > 0 ? validation.height : null,
  };
}

export function serializeFile(row: typeof schema.userFiles.$inferSelect) {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    version: row.version,
    parentId: row.parentId,
    toolChain: row.toolChain ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Answers a quota refusal from quotaRefusal(). The upload size limit answers
 * 413 too, so the code is what tells the web app's Save to Files to say the
 * library is full rather than that the file is too large (#1350).
 */
function sendOverQuota(reply: FastifyReply, message: string) {
  return reply.status(413).send({ error: message, code: "STORAGE_QUOTA_EXCEEDED" });
}

/**
 * Deletes a blob written before a library commit that then failed or was
 * refused. No row points at it, so one this can't delete is orphaned for good:
 * report it, don't just warn (#1472). It's wrapped so orphans group on their
 * own in Sentry, and so an S3 connection reset isn't taken for this client
 * hanging up. The client still gets the refusal or fault that caused the
 * discard.
 */
function discardStagedBlob(request: FastifyRequest, route: string, storedName: string) {
  return deleteStoredFile(storedName).catch((err) => {
    request.log.error({ err, storedName }, "Failed to discard a staged upload");
    void reportError(
      new SafeError("Could not discard a staged upload", {
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: err,
      }),
      {
        source: "http",
        route,
        method: "POST",
        subsystem: "upload-storage",
      },
    );
  });
}

function rethrowIfLibraryStorageFault(e: unknown): void {
  if (isStorageServiceFault(e)) throw normalizeS3ReadFault(e);
  if (isS3MissingShape(e)) return;
  if (isSafeMessageError(e) && e.code === "INVALID_STORED_NAME") return;
  const { code } = (e ?? {}) as NodeJS.ErrnoException;
  if (code === "ENOENT") return;
  throw e;
}

// ── Route registration ─────────────────────────────────────────────

export async function userFileRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/files
   *
   * Returns the latest version of each file chain, sorted by createdAt DESC.
   * A file is "latest" if its id is not referenced as a parentId by any other file.
   *
   * Query params:
   *   search  — filter on originalName (SQL LIKE)
   *   limit   — default 50
   *   offset  — default 0
   */
  app.get(
    "/api/v1/files",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (
      request: FastifyRequest<{
        Querystring: { search?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const limit = parseInt(request.query.limit ?? "50", 10) || 50;
      const offset = parseInt(request.query.offset ?? "0", 10) || 0;
      const search = request.query.search?.trim();

      // A file is the "latest" if no other row has it as its parentId.
      // We use a SQL NOT IN subquery for this.
      const latestCondition = sql`${schema.userFiles.id} NOT IN (
        SELECT parent_id FROM user_files WHERE parent_id IS NOT NULL
      )`;

      // Build the where clauses
      const conditions = [latestCondition];

      // Users without files:all only see their own files
      if (!(await hasEffectivePermission(user, "files:all"))) {
        conditions.push(eq(schema.userFiles.userId, user.id));
      }

      if (search) {
        const escaped = search.replace(/[%_\\]/g, "\\$&");
        conditions.push(like(schema.userFiles.originalName, `%${escaped}%`));
      }

      const rows = await db
        .select()
        .from(schema.userFiles)
        .where(and(...conditions))
        .orderBy(desc(schema.userFiles.createdAt))
        .limit(limit)
        .offset(offset);

      // Total count (for pagination)
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.userFiles)
        .where(and(...conditions));

      return reply.send({
        files: rows.map(serializeFile),
        total: countResult?.count ?? 0,
        limit,
        offset,
      });
    },
  );

  /**
   * POST /api/v1/files/upload
   *
   * Multipart form with one or more file parts. Each is checked as an image
   * (magic bytes + dimensions); one that passes is stored with its sniffed
   * type, one that doesn't is still kept, under a type from
   * unverifiedMime(). Stores to disk, creates DB record.
   */
  app.post(
    "/api/v1/files/upload",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;
      const userId = user.id;

      // Refuse an account already over quota before reading the body.
      const overQuota = await quotaRefusal(db, userId, 0);
      if (overQuota) return sendOverQuota(reply, overQuota);

      // All-or-nothing (#1342): every part is validated, quota-checked against
      // the whole batch, and written to storage first. Only once every part
      // has made it are the rows inserted and the quota charged, in one
      // transaction. Any failure on the way deletes what was staged, so an
      // error response always means nothing was saved.
      const staged: { storedName: string; values: typeof schema.userFiles.$inferInsert }[] = [];
      let stagedBytes = 0;
      const discardStaged = async () => {
        await Promise.all(
          staged.map(({ storedName }) =>
            discardStagedBlob(request, "/api/v1/files/upload", storedName),
          ),
        );
      };

      const parts = request.parts();

      // Optional "toolId" field records the tool that produced these files so the
      // library shows it under "Tools Used". Sent before the file part(s).
      let sourceToolId: string | null = null;

      try {
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "toolId") {
            const value = typeof part.value === "string" ? part.value : "";
            if (/^[a-z0-9-]{1,40}$/.test(value)) sourceToolId = value;
            continue;
          }
          if (part.type !== "file") continue;

          const buffer = await readFilePart(part.file);

          if (buffer.length === 0) continue;

          // Sanitize SVG uploads to prevent XXE, SSRF, and script injection.
          // Keyed on content, NOT on validation: a hostile SVG (a DOCTYPE with
          // an external entity, say) makes Sharp fail validation, and gating the
          // sanitizer on a successful decode would store the payload untouched.
          // Handled here rather than thrown so the answer stays specific: the
          // sanitizer's reason for a size/element-cap rejection (400), and a
          // reported 500 for anything unexpected. Either way the batch so far
          // is discarded first.
          let safeName = sanitizeFilename(part.filename ?? "upload");
          let safeBuffer: Buffer = buffer;
          const ext = extname(safeName).toLowerCase();
          let isDecompressedSvg = false;
          let sanitizedAsSvg = false;
          if (ext === ".svgz" || isSvgBuffer(buffer)) {
            try {
              if (ext === ".svgz") {
                safeBuffer = decompressSvgz(buffer);
              }
              if (isSvgBuffer(safeBuffer)) {
                safeBuffer = sanitizeSvg(safeBuffer);
                sanitizedAsSvg = true;
                if (ext === ".svgz") {
                  isDecompressedSvg = true;
                }
              }
            } catch (err) {
              if ((err as { message?: string })?.message?.includes("SVGZ file does not contain")) {
                // Not a valid SVG inside, let it fall through to be stored as octet-stream
                request.log.warn(
                  { err, filename: part.filename },
                  "Uploaded .svgz file does not contain SVG, storing as opaque file",
                );
                safeBuffer = buffer;
              } else if (isSvgzClientError(err)) {
                request.log.warn({ err, filename: part.filename }, "SVGZ decompression failed");
                await discardStaged();
                return reply.status(400).send({ error: (err as Error).message });
              } else {
                const oom = asDecoderOutOfMemory(err);
                if (oom instanceof DecoderOutOfMemoryError) throw oom;
                request.log.error({ err, filename: part.filename }, "SVG sanitize failed");
                void reportError(err, {
                  source: "http",
                  route: "/api/v1/files/upload",
                  method: "POST",
                  statusCode: 500,
                });
                await discardStaged();
                return reply.status(500).send({ error: "Internal server error" });
              }
            }
          }

          // Quota is checked against the whole batch so far, not this file alone:
          // nothing is charged until the commit below, which checks again under
          // a lock. This one stops reading as soon as the batch can't fit.
          const batchOverQuota = await quotaRefusal(db, userId, stagedBytes + safeBuffer.length);
          if (batchOverQuota) {
            await discardStaged();
            return sendOverQuota(reply, batchOverQuota);
          }

          if (isDecompressedSvg && safeName.toLowerCase().endsWith(".svgz")) {
            safeName = safeName.replace(/\.svgz$/i, ".svg");
          }

          // Validated after sanitizing, so the type describes the bytes that
          // are stored: a hostile SVG that only decodes once it's clean is an
          // SVG (#1550). Non-images fail here and keep a type from
          // unverifiedMime().
          const validation = await validateImageBuffer(safeBuffer, safeName).catch((err) => {
            if (err instanceof DecoderOutOfMemoryError || hasServerErrorStatus(err)) throw err;
            request.log.warn({ err, filename: safeName }, "Image validation threw unexpectedly");
            return null;
          });
          const isValidImage = validation?.valid === true && !validation.nameOnly;
          if (!sanitizedAsSvg && isValidImage && validation.format === "svg") {
            const preSanitizeLength = safeBuffer.length;
            try {
              safeBuffer = sanitizeSvg(decompressSvgz(safeBuffer));
              sanitizedAsSvg = true;
            } catch (err) {
              if (isSvgClientError(err)) {
                request.log.warn({ err, filename: part.filename }, "SVGZ decompression failed");
                await discardStaged();
                return reply.status(400).send({ error: (err as Error).message });
              }
              const oom = asDecoderOutOfMemory(err);
              if (oom instanceof DecoderOutOfMemoryError) throw oom;
              request.log.error({ err, filename: part.filename }, "SVG sanitize failed");
              void reportError(err, {
                source: "http",
                route: "/api/v1/files/upload",
                method: "POST",
                statusCode: 500,
              });
              await discardStaged();
              return reply.status(500).send({ error: "Internal server error" });
            }
            if (safeBuffer.length > preSanitizeLength) {
              const postSanitizeOverQuota = await quotaRefusal(
                db,
                userId,
                stagedBytes + safeBuffer.length,
              );
              if (postSanitizeOverQuota) {
                await discardStaged();
                return sendOverQuota(reply, postSanitizeOverQuota);
              }
            }
          }
          const mimeType =
            (isValidImage && validatedImageMime(validation, safeName)) ||
            unverifiedMime(part.mimetype || "application/octet-stream");
          const dimensions = measuredDimensions(isValidImage ? validation : null);

          const storedName = await saveFile(safeBuffer, safeName);
          stagedBytes += safeBuffer.length;
          staged.push({
            storedName,
            values: {
              id: randomUUID(),
              userId,
              originalName: safeName,
              storedName,
              mimeType,
              size: safeBuffer.length,
              width: dimensions.width,
              height: dimensions.height,
              version: 1,
              parentId: null,
              toolChain: sourceToolId ? [sourceToolId] : null,
            },
          });
        }
      } catch (err) {
        // A request the parser rejected (over the upload limit, too many
        // files, a body cut off mid-part), a quota lookup or a storage write
        // that threw: undo the batch, then let the error handler answer with
        // the error's own status. Parser failures carry theirs (413 for the
        // size limit, #1280; 400 otherwise, #1473); a database or storage
        // fault has none and answers a reported 500.
        await discardStaged();
        throw err;
      }

      if (staged.length === 0) {
        return reply.status(400).send({ error: "No valid files uploaded" });
      }

      let committed: { rows: (typeof schema.userFiles.$inferSelect)[] } | { overQuota: string };
      try {
        committed = await db.transaction(async (tx) => {
          // The checks above ran before anything was charged, so a concurrent
          // upload could have passed them too (#1473). This one holds the
          // locks through the charge, so only uploads that still fit land.
          const overQuota = await quotaRefusal(tx, userId, stagedBytes, true);
          if (overQuota) return { overQuota };
          const inserted = await tx
            .insert(schema.userFiles)
            .values(staged.map((s) => s.values))
            .returning();
          await tx
            .update(schema.users)
            .set({ storageUsed: sql`${schema.users.storageUsed} + ${stagedBytes}` })
            .where(eq(schema.users.id, userId));
          return { rows: inserted };
        });
      } catch (err) {
        // user_files has no unique constraint, so this isn't a conflict: it's a
        // database fault (connection lost, timeout, the user deleted mid-upload).
        // Discard the blobs, then let the error handler answer 500 and report
        // it. Known edge: if the connection drops after Postgres committed but
        // before the ack, the rows exist and this deletes their blobs. That's
        // rare, and it's the price of never leaving orphans on the common path.
        await discardStaged();
        throw err;
      }
      if ("overQuota" in committed) {
        await discardStaged();
        return sendOverQuota(reply, committed.overQuota);
      }
      // Keep the response in upload order; RETURNING doesn't promise one.
      const byId = new Map(committed.rows.map((r) => [r.id, r]));
      const created = staged.flatMap((s) => {
        const row = byId.get(s.values.id as string);
        return row ? [serializeFile(row)] : [];
      });
      if (created.length !== staged.length) {
        request.log.error(
          { staged: staged.length, returned: created.length },
          "Library upload commit returned fewer rows than it inserted",
        );
      }

      await auditFromRequest(request)("FILE_UPLOADED", {
        userId,
        username: user.username,
        count: created.length,
        files: created.map((f) => f.originalName),
      });

      return reply.status(201).send({ files: created });
    },
  );

  /**
   * GET /api/v1/files/:id
   *
   * Returns full metadata for a file plus the complete version chain
   * (from the root ancestor down through every version to the latest).
   */
  app.get(
    "/api/v1/files/:id",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const { id } = request.params;

      const [file] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

      if (
        !file ||
        (file.userId !== user.id && !(await hasEffectivePermission(user, "files:all")))
      ) {
        return reply.status(404).send({ error: "File not found" });
      }

      // Walk the full version chain using a recursive CTE.
      // First find the root ancestor, then collect all descendants.
      //
      // node-postgres returns:
      //   tool_chain as parsed jsonb (string[] | null) - do NOT JSON.parse
      //   created_at as Date (timestamptz) - use directly, no * 1000
      type ChainRow = {
        id: string;
        original_name: string;
        mime_type: string;
        size: number;
        width: number | null;
        height: number | null;
        version: number;
        parent_id: string | null;
        tool_chain: string[] | null;
        created_at: Date;
      };

      const cteResult = await db.execute<ChainRow>(sql`
        WITH RECURSIVE
        ancestors(id, parent_id) AS (
          SELECT id, parent_id FROM user_files WHERE id = ${id}
          UNION ALL
          SELECT uf.id, uf.parent_id FROM user_files uf
          INNER JOIN ancestors a ON uf.id = a.parent_id
        ),
        chain(id, original_name, mime_type, size, width, height,
              version, parent_id, tool_chain, created_at) AS (
          SELECT f.id, f.original_name, f.mime_type, f.size, f.width, f.height,
                 f.version, f.parent_id, f.tool_chain, f.created_at
          FROM user_files f
          WHERE f.id = (
            SELECT a.id FROM ancestors a
            WHERE a.parent_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM user_files p WHERE p.id = a.parent_id)
            LIMIT 1
          )
          UNION ALL
          SELECT child.id, child.original_name, child.mime_type, child.size,
                 child.width, child.height, child.version, child.parent_id,
                 child.tool_chain, child.created_at
          FROM user_files child
          INNER JOIN chain c ON child.parent_id = c.id
        )
        SELECT * FROM chain ORDER BY version ASC
      `);
      const chainRows = cteResult.rows;

      const versions = chainRows.map((r) => ({
        id: r.id,
        originalName: r.original_name,
        mimeType: r.mime_type,
        size: r.size,
        width: r.width,
        height: r.height,
        version: r.version,
        parentId: r.parent_id,
        toolChain: r.tool_chain ?? [],
        createdAt: new Date(r.created_at).toISOString(),
      }));

      return reply.send({
        file: serializeFile(file),
        versions,
      });
    },
  );

  /**
   * GET /api/v1/files/:id/download
   *
   * Stream the stored file back to the client as an attachment.
   */
  app.get(
    "/api/v1/files/:id/download",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const { id } = request.params;

      const [file] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

      if (
        !file ||
        (file.userId !== user.id && !(await hasEffectivePermission(user, "files:all")))
      ) {
        return reply.status(404).send({ error: "File not found" });
      }

      let stream: Awaited<ReturnType<typeof streamStoredFile>>;
      try {
        stream = await streamStoredFile(file.storedName);
      } catch (e) {
        // streamStoredFile rejects for every open-time fault, not only a
        // missing blob. Only proven missing-object rejections (ENOENT, S3
        // NoSuchKey/404) and a poisoned stored_name (INVALID_STORED_NAME)
        // keep their 404 mapping; every other local or S3 fault rethrows to
        // the global handler and Sentry (#937, #2808, #2851).
        rethrowIfLibraryStorageFault(e);
        request.log.warn(
          { fileId: id, storedName: file.storedName },
          "library download: stored blob missing",
        );
        return reply.status(404).send({ error: "File not found in storage" });
      }

      return reply
        .header("Content-Type", file.mimeType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(file.originalName)}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        )
        .send(stream);
    },
  );

  /**
   * GET /api/v1/files/:id/thumbnail
   *
   * Generate and return a 300px-wide JPEG thumbnail on the fly via Sharp.
   */
  app.get(
    "/api/v1/files/:id/thumbnail",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const { id } = request.params;

      const [file] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

      if (
        !file ||
        (file.userId !== user.id && !(await hasEffectivePermission(user, "files:all")))
      ) {
        return reply.status(404).send({ error: "File not found" });
      }

      const contentType = thumbnailContentType(file.mimeType);

      // Serve from disk cache if available
      let cached: Buffer | null;
      try {
        cached = await getCachedThumbnail(file.storedName);
      } catch (e) {
        rethrowIfLibraryStorageFault(e);
        throw e;
      }
      if (cached) {
        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(cached);
      }

      const cacheThumbnail = (buffer: Buffer) => {
        saveThumbnail(file.storedName, buffer).catch((err) => {
          request.log.warn(
            { err, fileId: id, storedName: file.storedName },
            "Failed to cache thumbnail",
          );
        });
      };

      let rawBuffer: Buffer;
      try {
        rawBuffer = await readStoredFile(file.storedName);
      } catch (e) {
        rethrowIfLibraryStorageFault(e);
        request.log.warn(
          { fileId: id, storedName: file.storedName },
          "library thumbnail: stored blob missing",
        );
        return reply.status(422).send({ error: "Could not generate thumbnail" });
      }

      try {
        // Video thumbnail via ffmpeg poster frame
        if (file.mimeType.startsWith("video/")) {
          const poster = await videoPosterPreview(rawBuffer);
          if (!poster) {
            request.log.warn(
              { fileId: id, storedName: file.storedName },
              "Thumbnail generation failed",
            );
            return reply.status(422).send({ error: "Could not generate thumbnail" });
          }
          cacheThumbnail(poster);
          return reply
            .header("Content-Type", contentType)
            .header("Cache-Control", "public, max-age=86400, immutable")
            .send(poster);
        }

        // PDF thumbnail via ghostscript first page
        if (file.mimeType === "application/pdf") {
          const page = await pdfFirstPagePreview(rawBuffer);
          if (!page) {
            request.log.warn(
              { fileId: id, storedName: file.storedName },
              "Thumbnail generation failed",
            );
            return reply.status(422).send({ error: "Could not generate thumbnail" });
          }
          cacheThumbnail(page);
          return reply
            .header("Content-Type", contentType)
            .header("Cache-Control", "public, max-age=86400, immutable")
            .send(page);
        }

        // Image thumbnail (existing path)
        const validation = await validateImageBuffer(rawBuffer, file.originalName);
        if (!validation.valid) {
          // Audio, data, and non-PDF document files have no raster thumbnail.
          // Return 422 (not 204) so the client's <img> onError falls back to a
          // modality icon instead of attempting a doomed Sharp decode below.
          return reply.status(422).send({ error: "No thumbnail available for this file type" });
        }
        let decoded: Buffer<ArrayBuffer> = Buffer.from(rawBuffer);
        let fallbackFormat: string | undefined;
        if (validation.valid && validation.format === "heif") {
          try {
            decoded = Buffer.from(await decodeHeic(rawBuffer));
          } catch (rawHeicErr) {
            throw normalizeOperationalWriteError(asDecoderOutOfMemory(rawHeicErr));
          }
        } else if (validation.valid && needsCliDecode(validation.format)) {
          try {
            const fileExt =
              extname(file.originalName).toLowerCase().replace(/^\./, "") || undefined;
            decoded = Buffer.from(await decodeToSharpCompat(rawBuffer, validation.format, fileExt));
          } catch (rawDecodeErr) {
            const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
            if (
              decodeErr instanceof DecoderOutOfMemoryError ||
              (!isDecoderUnavailable(decodeErr) && isPreviewServerFault(decodeErr))
            ) {
              throw decodeErr;
            }
            try {
              const meta = await sharp(rawBuffer).metadata();
              fallbackFormat = meta.format;
              if (fallbackFormat !== "svg") {
                await sharp(rawBuffer).resize(1).raw().toBuffer();
              }
            } catch (err) {
              const probeErr = asDecoderOutOfMemory(err);
              if (probeErr instanceof DecoderOutOfMemoryError) {
                throw probeErr;
              }
              throw decodeErr;
            }
          }
        }
        if (validation.format === "svg" || fallbackFormat === "svg") {
          decoded = Buffer.from(sanitizeSvg(decompressSvgz(decoded)));
        }
        const fileBuffer = decoded;

        const thumbnail = await sharp(fileBuffer)
          .resize(300, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        // Cache to disk (non-blocking, don't fail the request)
        cacheThumbnail(thumbnail);

        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(thumbnail);
      } catch (err) {
        const decoderErr = asDecoderOutOfMemory(err);
        if (isDecoderUnavailable(decoderErr)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(decoderErr),
            "user-file-thumbnail",
            request.log,
          );
        }
        if (isPreviewServerFault(err)) {
          throw err;
        }
        request.log.warn(
          { err, fileId: id, storedName: file.storedName },
          "Thumbnail generation failed",
        );
        return reply.status(422).send({ error: "Could not generate thumbnail" });
      }
    },
  );

  /**
   * DELETE /api/v1/files
   *
   * Bulk delete. Body: { ids: string[] }
   * For each id, deletes the entire version chain (all ancestors and descendants).
   */
  app.delete(
    "/api/v1/files",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requireFileAccess(request, reply);
      if (!user) return;

      const parsed = deleteFilesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }
      const { ids } = parsed.data;

      // Check files:all permission once upfront
      const canDeleteAll = await hasEffectivePermission(user, "files:all");

      // Batch ownership check: single SELECT for all requested IDs
      const candidates = await db
        .select({ id: schema.userFiles.id, userId: schema.userFiles.userId })
        .from(schema.userFiles)
        .where(inArray(schema.userFiles.id, ids));

      const validIds = candidates
        .filter((f) => f.userId === user.id || canDeleteAll)
        .map((f) => f.id);

      if (validIds.length === 0) {
        await auditFromRequest(request)("FILE_DELETED", {
          userId: user.id,
          username: user.username,
          count: 0,
          ids,
        });
        return reply.send({ deleted: 0 });
      }

      type DeleteChainRow = {
        id: string;
        stored_name: string;
        size: number | null;
        user_id: string | null;
      };

      // Single recursive CTE to collect all chain members for every valid ID
      const seedIds = sql.join(
        validIds.map((id) => sql`${id}`),
        sql`, `,
      );
      const cteResult = await db.execute<DeleteChainRow>(sql`
      WITH RECURSIVE
      ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM user_files
        WHERE id IN (${seedIds})
        UNION ALL
        SELECT uf.id, uf.parent_id FROM user_files uf
        INNER JOIN ancestors a ON uf.id = a.parent_id
      ),
      chain(id, stored_name, size, user_id) AS (
        SELECT f.id, f.stored_name, f.size, f.user_id FROM user_files f
        WHERE f.id IN (
          SELECT a.id FROM ancestors a
          WHERE a.parent_id IS NULL
             OR NOT EXISTS (SELECT 1 FROM user_files p WHERE p.id = a.parent_id)
        )
        UNION ALL
        SELECT child.id, child.stored_name, child.size, child.user_id
        FROM user_files child
        INNER JOIN chain c ON child.parent_id = c.id
      )
      SELECT DISTINCT id, stored_name, size, user_id FROM chain
    `);
      const chainRows = cteResult.rows;
      const deletableChainRows = canDeleteAll
        ? chainRows
        : chainRows.filter((row) => row.user_id === user.id);

      // Filesystem deletes (must loop; cannot batch across the OS)
      for (const row of deletableChainRows) {
        await deleteLibraryFileStorage({ id: row.id, storedName: row.stored_name });
      }

      // Batch DB delete
      const chainIds = deletableChainRows.map((r) => r.id);
      if (chainIds.length > 0) {
        await db.delete(schema.userFiles).where(inArray(schema.userFiles.id, chainIds));
      }

      // Decrement storageUsed per user (group by userId for files:all scenarios)
      const perUserSizes = new Map<string, number>();
      for (const row of deletableChainRows) {
        if (row.user_id && row.size) {
          perUserSizes.set(row.user_id, (perUserSizes.get(row.user_id) ?? 0) + row.size);
        }
      }
      for (const [uid, totalSize] of perUserSizes) {
        await db
          .update(schema.users)
          .set({
            storageUsed: sql`GREATEST(0, ${schema.users.storageUsed} - ${totalSize})`,
          })
          .where(eq(schema.users.id, uid));
      }

      await auditFromRequest(request)("FILE_DELETED", {
        userId: user.id,
        username: user.username,
        count: deletableChainRows.length,
        ids,
      });

      return reply.send({ deleted: deletableChainRows.length });
    },
  );

  /**
   * POST /api/v1/files/save-result
   *
   * Save the output of a tool as a new version linked to a parent file.
   * Multipart fields:
   *   file     — the processed image
   *   parentId — id of the parent user file record
   *   toolId   — the tool that produced this result
   */
  app.post("/api/v1/files/save-result", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireFileAccess(request, reply);
    if (!user) return;
    const userId = user.id;

    // Enforce per-user storage quota before saving results
    const overQuota = await quotaRefusal(db, userId, 0);
    if (overQuota) return sendOverQuota(reply, overQuota);

    let fileBuffer: Buffer | null = null;
    let filename = "result";
    let parentId: string | null = null;
    let toolId: string | null = null;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        fileBuffer = await readFilePart(part.file);
        filename = sanitizeFilename(part.filename ?? "result");
      } else if (part.fieldname === "parentId") {
        parentId = (part.value as string).trim() || null;
      } else if (part.fieldname === "toolId") {
        toolId = (part.value as string).trim() || null;
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No file provided" });
    }

    if (!parentId) {
      return reply.status(400).send({ error: "parentId is required" });
    }

    // Look up the parent to compute the next version and carry forward the tool chain
    const [parent] = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, parentId));

    if (!parent) {
      return reply.status(404).send({ error: "Parent file not found" });
    }
    if (
      parent.userId &&
      parent.userId !== user.id &&
      !(await hasEffectivePermission(user, "files:all"))
    ) {
      return reply.status(404).send({ error: "Parent file not found" });
    }

    const parentExt = extname(parent.originalName);
    let ext = extname(filename) || parentExt;

    // Sanitize SVG results to prevent XXE, SSRF, and script injection
    let safeResultBuffer = fileBuffer;
    const resultExt = ext.toLowerCase();
    let isDecompressedSvg = false;
    let sanitizedAsSvg = false;
    if (resultExt === ".svgz" || isSvgBuffer(fileBuffer)) {
      try {
        if (resultExt === ".svgz") {
          safeResultBuffer = decompressSvgz(fileBuffer);
        }
        if (isSvgBuffer(safeResultBuffer)) {
          safeResultBuffer = sanitizeSvg(safeResultBuffer);
          sanitizedAsSvg = true;
          if (resultExt === ".svgz") {
            isDecompressedSvg = true;
          }
        }
      } catch (err) {
        if ((err as { message?: string })?.message?.includes("SVGZ file does not contain")) {
          request.log.warn(
            { err, filename },
            "Result .svgz file does not contain SVG, storing as opaque file",
          );
          safeResultBuffer = fileBuffer;
        } else if (isSvgzClientError(err)) {
          request.log.warn({ err, filename }, "SVGZ decompression failed");
          return reply.status(400).send({ error: (err as Error).message });
        } else {
          const oom = asDecoderOutOfMemory(err);
          if (oom instanceof DecoderOutOfMemoryError) throw oom;
          request.log.error({ err, filename }, "SVG sanitize failed");
          void reportError(err, {
            source: "http",
            route: "/api/v1/files/save-result",
            method: "POST",
            statusCode: 500,
          });
          return reply.status(500).send({ error: "Internal server error" });
        }
      }
    }

    // Determine the original filename (preserve parent's name, update extension)
    if (isDecompressedSvg && resultExt === ".svgz") ext = ".svg";
    const baseName = parentExt
      ? parent.originalName.slice(0, -parentExt.length)
      : parent.originalName;
    const resultName = `${baseName}${ext}`;

    // Try image validation on the bytes that will be stored; non-image outputs
    // from trusted tools are accepted
    const validation = await validateImageBuffer(safeResultBuffer, resultName).catch((err) => {
      if (err instanceof DecoderOutOfMemoryError || hasServerErrorStatus(err)) throw err;
      request.log.warn({ err, filename: resultName }, "Image validation threw unexpectedly");
      return null;
    });
    const isValidImage = validation?.valid === true && !validation.nameOnly;
    if (!sanitizedAsSvg && isValidImage && validation.format === "svg") {
      try {
        safeResultBuffer = sanitizeSvg(decompressSvgz(safeResultBuffer));
        sanitizedAsSvg = true;
      } catch (err) {
        if (isSvgClientError(err)) {
          request.log.warn({ err, filename }, "SVGZ decompression failed");
          return reply.status(400).send({ error: (err as Error).message });
        }
        const oom = asDecoderOutOfMemory(err);
        if (oom instanceof DecoderOutOfMemoryError) throw oom;
        request.log.error({ err, filename }, "SVG sanitize failed");
        void reportError(err, {
          source: "http",
          route: "/api/v1/files/save-result",
          method: "POST",
          statusCode: 500,
        });
        return reply.status(500).send({ error: "Internal server error" });
      }
    }

    const nextVersion = parent.version + 1;

    // Build the tool chain: append the new toolId to the parent's chain
    const existingChain: string[] = parent.toolChain ?? [];
    const newChain = toolId ? [...existingChain, toolId] : existingChain;

    const mimeType =
      (isValidImage && validatedImageMime(validation, resultName)) ||
      unverifiedMime(extToMime(ext));
    const dimensions = measuredDimensions(isValidImage ? validation : null);

    // Re-check quota with actual file size before persisting
    const fileSize = safeResultBuffer.length;
    const resultOverQuota = await quotaRefusal(db, userId, fileSize);
    if (resultOverQuota) return sendOverQuota(reply, resultOverQuota);

    // Persist to disk
    const storedName = await saveFile(safeResultBuffer, resultName);

    // Lock the quota rows, re-verify the parent row still exists, insert the
    // version row, and charge storage_used in one transaction (#1537, #2939),
    // matching /api/v1/files/upload (#1473) and stageAutoSaveToLibrary (#2927).
    const id = randomUUID();
    let committed:
      | { row: typeof schema.userFiles.$inferSelect | undefined }
      | { overQuota: string }
      | { parentDeleted: true };
    try {
      committed = await db.transaction(async (tx) => {
        const overQuota = await quotaRefusal(tx, userId, fileSize, true);
        if (overQuota) return { overQuota };
        const [currentParent] = await tx
          .select({ id: schema.userFiles.id })
          .from(schema.userFiles)
          .where(eq(schema.userFiles.id, parentId))
          .limit(1)
          .for("no key update");
        if (!currentParent) return { parentDeleted: true };
        const [inserted] = await tx
          .insert(schema.userFiles)
          .values({
            id,
            userId,
            originalName: resultName,
            storedName,
            mimeType,
            size: fileSize,
            width: dimensions.width,
            height: dimensions.height,
            version: nextVersion,
            parentId,
            toolChain: newChain,
          })
          .returning();
        await tx
          .update(schema.users)
          .set({ storageUsed: sql`${schema.users.storageUsed} + ${fileSize}` })
          .where(eq(schema.users.id, userId));
        return { row: inserted };
      });
    } catch (err) {
      await discardStagedBlob(request, "/api/v1/files/save-result", storedName);
      throw err;
    }
    if ("overQuota" in committed) {
      await discardStagedBlob(request, "/api/v1/files/save-result", storedName);
      return sendOverQuota(reply, committed.overQuota);
    }
    if ("parentDeleted" in committed) {
      await discardStagedBlob(request, "/api/v1/files/save-result", storedName);
      return reply.status(404).send({ error: "Parent file not found" });
    }

    return reply.status(201).send({ file: committed.row ? serializeFile(committed.row) : null });
  });

  app.log.info("User file routes registered");
}
