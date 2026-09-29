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
import { SafeError } from "@snapotter/shared";
import { and, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../config.js";
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
import { type ValidationResult, validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import {
  decodeToSharpCompat,
  isDecoderUnavailable,
  needsCliDecode,
} from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { deleteLibraryFileStorage } from "../lib/library-cleanup.js";
import { readFilePart } from "../lib/multipart-parts.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";
import { engineUnavailable } from "../modality/image-input.js";
import { pdfFirstPagePreview, videoPosterPreview } from "../modality/preview.js";
import { hasEffectivePermission, requireFileAccess } from "../permissions.js";

// ── Helpers ────────────────────────────────────────────────────────

function formatToMime(format: string): string {
  const map: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    avif: "image/avif",
  };
  return map[format] ?? "application/octet-stream";
}

function extToMime(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, "");
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
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    aac: "audio/aac",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
  };
  return map[clean] ?? "application/octet-stream";
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
function unverifiedMime(claimedMime: string): string {
  return claimedMime.startsWith("image/") ? "application/octet-stream" : claimedMime;
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
function measuredDimensions(validation: ValidationResult | null): {
  width: number | null;
  height: number | null;
} {
  if (!validation) return { width: null, height: null };
  return {
    width: validation.width > 0 ? validation.width : null,
    height: validation.height > 0 ? validation.height : null,
  };
}

function serializeFile(row: typeof schema.userFiles.$inferSelect) {
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
 * Why storing `additionalBytes` more would put the user, or their team, over
 * quota: the message for a 413, or null when it fits. Uses the pre-computed
 * storageUsed counters. A database fault throws rather than reading as "over
 * quota", so the caller answers a reported 500 instead of a 413 nobody looks
 * into (#1473).
 *
 * `lock` is for the transaction that charges the bytes: it locks the user's
 * row, and the team's row when the team has a quota, before reading. A
 * concurrent upload by the same user or a teammate then waits here until this
 * one commits and sees its charge, so two uploads that each fit can't both
 * land over the limit. NO KEY UPDATE is enough for that and, unlike UPDATE,
 * doesn't hold up inserts elsewhere that reference the user.
 */
async function quotaRefusal(
  conn: Pick<typeof db, "select">,
  userId: string,
  additionalBytes: number,
  lock = false,
): Promise<string | null> {
  const userQuery = conn
    .select({
      storageUsed: schema.users.storageUsed,
      storageQuota: schema.users.storageQuota,
      team: schema.users.team,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const [user] = lock ? await userQuery.for("no key update") : await userQuery;

  if (!user) return null;
  const { storageUsed, storageQuota, team } = user;

  // Per-user quota: user-level override, then env fallback
  const userLimit =
    storageQuota ??
    (env.MAX_STORAGE_PER_USER_MB > 0 ? env.MAX_STORAGE_PER_USER_MB * 1024 * 1024 : 0);
  if (userLimit > 0 && storageUsed + additionalBytes > userLimit) {
    return `Storage quota exceeded. Used ${((storageUsed + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(userLimit / (1024 * 1024)).toFixed(1)}MB`;
  }

  // Per-team quota. Only a team with a quota is locked: every upload on the
  // instance would otherwise queue on the Default team's row.
  if (team) {
    const teamQuery = conn
      .select({ storageQuota: schema.teams.storageQuota })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, team), isNotNull(schema.teams.storageQuota)))
      .limit(1);
    const [teamRow] = lock ? await teamQuery.for("no key update") : await teamQuery;

    if (teamRow?.storageQuota) {
      const [teamUsed] = await conn
        .select({
          total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)`,
        })
        .from(schema.users)
        .where(eq(schema.users.team, team));

      const teamTotal = Number(teamUsed.total);
      if (teamTotal + additionalBytes > teamRow.storageQuota) {
        return `Team storage quota exceeded. Team used ${((teamTotal + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(teamRow.storageQuota / (1024 * 1024)).toFixed(1)}MB`;
      }
    }
  }
  return null;
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
      // The request has already failed and no row points at a staged blob, so
      // one this can't delete is orphaned for good: report it, don't just warn
      // (#1472). It's wrapped so orphans group on their own in Sentry, and so
      // an S3 connection reset isn't taken for this client hanging up. The
      // client still gets the refusal that caused the discard.
      const discardStaged = async () => {
        await Promise.all(
          staged.map(({ storedName }) =>
            deleteStoredFile(storedName).catch((err) => {
              request.log.error({ err, storedName }, "Failed to discard a staged upload");
              void reportError(
                new SafeError("Could not discard a staged upload", {
                  kind: "operational",
                  code: "STAGED_DISCARD_FAILED",
                  cause: err,
                }),
                {
                  source: "http",
                  route: "/api/v1/files/upload",
                  method: "POST",
                  subsystem: "upload-storage",
                },
              );
            }),
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

          // Try image validation; non-image files skip validation and use MIME from extension
          const validation = await validateImageBuffer(buffer, part.filename).catch(() => null);
          const isValidImage = validation?.valid === true;

          // Sanitize SVG uploads to prevent XXE, SSRF, and script injection.
          // Keyed on content, NOT on isValidImage: a hostile SVG (a DOCTYPE with
          // an external entity, say) makes Sharp fail validation, and gating the
          // sanitizer on a successful decode would store the payload untouched.
          // Handled here rather than thrown so the answer stays specific: the
          // sanitizer's reason for a size/element-cap rejection (400), and a
          // reported 500 for anything unexpected. Either way the batch so far
          // is discarded first.
          let safeBuffer: Buffer = buffer;
          if (isSvgBuffer(buffer)) {
            try {
              safeBuffer = sanitizeSvg(buffer);
            } catch (err) {
              if ((err as { statusCode?: number }).statusCode === 400) {
                await discardStaged();
                return reply.status(400).send({ error: (err as Error).message });
              }
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

          // Quota is checked against the whole batch so far, not this file alone:
          // nothing is charged until the commit below, which checks again under
          // a lock. This one stops reading as soon as the batch can't fit.
          const batchOverQuota = await quotaRefusal(db, userId, stagedBytes + safeBuffer.length);
          if (batchOverQuota) {
            await discardStaged();
            return sendOverQuota(reply, batchOverQuota);
          }

          const safeName = sanitizeFilename(part.filename ?? "upload");
          const mimeType = isValidImage
            ? formatToMime(validation.format)
            : unverifiedMime(part.mimetype || "application/octet-stream");
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
          WHERE f.id = (SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1)
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
        // missing blob. A syscall failure other than ENOENT (EACCES, ENOTDIR)
        // and an S3 service fault other than a missing object (AccessDenied,
        // rotated credentials, S3 5xx) are storage faults that must keep
        // reaching the global handler and Sentry (#937). A missing blob and a
        // poisoned stored_name keep their long-standing 404 mapping.
        const { code, syscall } = e as NodeJS.ErrnoException;
        if (syscall && code !== "ENOENT") throw e;
        if (isStorageServiceFault(e)) throw e;
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

      // Serve from disk cache if available
      const cached = await getCachedThumbnail(file.storedName);
      if (cached) {
        return reply
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(cached);
      }

      try {
        const rawBuffer = await readStoredFile(file.storedName);

        // Video thumbnail via ffmpeg poster frame
        if (file.mimeType.startsWith("video/")) {
          const poster = await videoPosterPreview(rawBuffer);
          if (!poster) {
            return reply.status(422).send({ error: "Could not generate thumbnail" });
          }
          saveThumbnail(file.storedName, poster).catch(() => {});
          return reply
            .header("Content-Type", "image/webp")
            .header("Cache-Control", "public, max-age=86400, immutable")
            .send(poster);
        }

        // PDF thumbnail via ghostscript first page
        if (file.mimeType === "application/pdf") {
          const page = await pdfFirstPagePreview(rawBuffer);
          if (!page) {
            return reply.status(422).send({ error: "Could not generate thumbnail" });
          }
          saveThumbnail(file.storedName, page).catch(() => {});
          return reply
            .header("Content-Type", "image/png")
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
        if (validation.valid && validation.format === "heif") {
          decoded = Buffer.from(await decodeHeic(rawBuffer));
        } else if (validation.valid && needsCliDecode(validation.format)) {
          try {
            const fileExt = file.originalName.split(".").pop()?.toLowerCase();
            decoded = Buffer.from(await decodeToSharpCompat(rawBuffer, validation.format, fileExt));
          } catch {
            // Sharp will attempt the raw buffer directly
          }
        }
        const fileBuffer = decoded;

        const thumbnail = await sharp(fileBuffer)
          .resize(300, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        // Cache to disk (non-blocking, don't fail the request)
        saveThumbnail(file.storedName, thumbnail).catch(() => {});

        return reply
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(thumbnail);
      } catch (err) {
        if (isDecoderUnavailable(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "user-file-thumbnail",
            request.log,
          );
        }
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

      const deleteSchema = z.object({
        ids: z.array(z.string()).min(1, "ids must be a non-empty array of strings"),
      });
      const parsed = deleteSchema.safeParse(request.body);
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
        await auditFromRequest(request)("FILE_DELETED", { userId: user.id, count: 0, ids });
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
        WHERE f.id IN (SELECT id FROM ancestors WHERE parent_id IS NULL)
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

    // Try image validation; non-image outputs from trusted tools are accepted
    const validation = await validateImageBuffer(fileBuffer, filename).catch(() => null);
    const isValidImage = validation?.valid === true;

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

    const nextVersion = parent.version + 1;

    // Build the tool chain: append the new toolId to the parent's chain
    const existingChain: string[] = parent.toolChain ?? [];
    const newChain = toolId ? [...existingChain, toolId] : existingChain;

    // Determine the original filename (preserve parent's name, update extension)
    const ext = extname(filename) || extname(parent.originalName);
    const baseName = parent.originalName.replace(/\.[^.]+$/, "");
    const resultName = `${baseName}${ext}`;

    const mimeType = isValidImage
      ? formatToMime(validation.format)
      : unverifiedMime(extToMime(ext));
    const dimensions = measuredDimensions(isValidImage ? validation : null);

    // Sanitize SVG results to prevent XXE, SSRF, and script injection
    const safeResultBuffer = isSvgBuffer(fileBuffer) ? sanitizeSvg(fileBuffer) : fileBuffer;

    // Re-check quota with actual file size before persisting
    const resultOverQuota = await quotaRefusal(db, userId, safeResultBuffer.length);
    if (resultOverQuota) return sendOverQuota(reply, resultOverQuota);

    // Persist to disk
    const storedName = await saveFile(safeResultBuffer, resultName);

    // Create DB record
    const id = randomUUID();
    const fileSize = safeResultBuffer.length;
    try {
      await db.insert(schema.userFiles).values({
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
      });
    } catch {
      return reply.status(409).send({ error: "Failed to save result record" });
    }

    // Increment the user's pre-computed storage counter
    if (userId) {
      await db
        .update(schema.users)
        .set({ storageUsed: sql`${schema.users.storageUsed} + ${fileSize}` })
        .where(eq(schema.users.id, userId));
    }

    const [row] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

    return reply.status(201).send({ file: row ? serializeFile(row) : null });
  });

  app.log.info("User file routes registered");
}
