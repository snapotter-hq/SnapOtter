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
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import {
  deleteStoredFile,
  deleteThumbnail,
  getCachedThumbnail,
  readStoredFile,
  saveFile,
  saveThumbnail,
  streamStoredFile,
} from "../lib/file-storage.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";
import { pdfFirstPagePreview, videoPosterPreview } from "../modality/preview.js";
import { hasEffectivePermission } from "../permissions.js";
import { getAuthUser, requireAuth } from "../plugins/auth.js";

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
 * Check whether a user (and their team) has exceeded their storage quota.
 * Uses the pre-computed storageUsed counter on the users table.
 * Throws with statusCode 413 if the quota is exceeded.
 */
async function checkStorageQuota(userId: string | null, additionalBytes = 0): Promise<void> {
  if (!userId) return;

  const [user] = await db
    .select({
      storageUsed: schema.users.storageUsed,
      storageQuota: schema.users.storageQuota,
      team: schema.users.team,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) return;
  const { storageUsed, storageQuota, team } = user;

  // Per-user quota: user-level override, then env fallback
  const userLimit =
    storageQuota ??
    (env.MAX_STORAGE_PER_USER_MB > 0 ? env.MAX_STORAGE_PER_USER_MB * 1024 * 1024 : 0);
  if (userLimit > 0 && storageUsed + additionalBytes > userLimit) {
    const error = new Error(
      `Storage quota exceeded. Used ${((storageUsed + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(userLimit / (1024 * 1024)).toFixed(1)}MB`,
    );
    (error as Error & { statusCode: number }).statusCode = 413;
    throw error;
  }

  // Per-team quota
  if (team) {
    const [teamRow] = await db
      .select({ storageQuota: schema.teams.storageQuota })
      .from(schema.teams)
      .where(eq(schema.teams.id, team))
      .limit(1);

    if (teamRow?.storageQuota) {
      const [teamUsed] = await db
        .select({
          total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)`,
        })
        .from(schema.users)
        .where(eq(schema.users.team, team));

      const teamTotal = Number(teamUsed.total);
      if (teamTotal + additionalBytes > teamRow.storageQuota) {
        const error = new Error(
          `Team storage quota exceeded. Team used ${((teamTotal + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(teamRow.storageQuota / (1024 * 1024)).toFixed(1)}MB`,
        );
        (error as Error & { statusCode: number }).statusCode = 413;
        throw error;
      }
    }
  }
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
      const user = requireAuth(request, reply);
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
   * Multipart form with one or more image file parts.
   * Validates each (magic bytes + dimensions), stores to disk, creates DB record.
   */
  app.post(
    "/api/v1/files/upload",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthUser(request);
      const userId = user?.id ?? null;

      // Enforce per-user storage quota before accepting uploads
      try {
        await checkStorageQuota(userId);
      } catch (err) {
        const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 413;
        return reply.status(statusCode).send({ error: (err as Error).message });
      }

      const created: ReturnType<typeof serializeFile>[] = [];

      const parts = request.parts();

      for await (const part of parts) {
        if (part.type !== "file") continue;

        // Consume the stream into a buffer
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        if (buffer.length === 0) continue;

        // Try image validation; non-image files skip validation and use MIME from extension
        const validation = await validateImageBuffer(buffer, part.filename).catch(() => null);
        const isValidImage = validation?.valid === true;

        // Sanitize SVG uploads to prevent XXE, SSRF, and script injection
        const safeBuffer = isValidImage && isSvgBuffer(buffer) ? sanitizeSvg(buffer) : buffer;

        // Re-check quota with actual file size before persisting
        try {
          await checkStorageQuota(userId, safeBuffer.length);
        } catch (err) {
          const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 413;
          return reply.status(statusCode).send({ error: (err as Error).message });
        }

        const safeName = sanitizeFilename(part.filename ?? "upload");
        const mimeType = isValidImage
          ? formatToMime(validation.format)
          : part.mimetype || "application/octet-stream";

        // Persist to disk
        const storedName = await saveFile(safeBuffer, safeName);

        // Create DB record
        const id = randomUUID();
        const fileSize = safeBuffer.length;
        try {
          await db.insert(schema.userFiles).values({
            id,
            userId,
            originalName: safeName,
            storedName,
            mimeType,
            size: fileSize,
            width: isValidImage ? validation.width : null,
            height: isValidImage ? validation.height : null,
            version: 1,
            parentId: null,
            toolChain: null,
          });
        } catch {
          return reply.status(409).send({ error: "Failed to save file record" });
        }

        // Increment the user's pre-computed storage counter
        if (userId) {
          await db
            .update(schema.users)
            .set({ storageUsed: sql`${schema.users.storageUsed} + ${fileSize}` })
            .where(eq(schema.users.id, userId));
        }

        const [row] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

        if (row) created.push(serializeFile(row));
      }

      if (created.length === 0) {
        return reply.status(400).send({ error: "No valid files uploaded" });
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
      const user = requireAuth(request, reply);
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
      const user = requireAuth(request, reply);
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
      } catch {
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
      const user = requireAuth(request, reply);
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
      } catch {
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
      const user = requireAuth(request, reply);
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

      // Filesystem deletes (must loop; cannot batch across the OS)
      for (const row of chainRows) {
        await deleteStoredFile(row.stored_name);
        await deleteThumbnail(row.stored_name);
      }

      // Batch DB delete
      const chainIds = chainRows.map((r) => r.id);
      if (chainIds.length > 0) {
        await db.delete(schema.userFiles).where(inArray(schema.userFiles.id, chainIds));
      }

      // Decrement storageUsed per user (group by userId for files:all scenarios)
      const perUserSizes = new Map<string, number>();
      for (const row of chainRows) {
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
        count: chainRows.length,
        ids,
      });

      return reply.send({ deleted: chainRows.length });
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
    const user = getAuthUser(request);
    const userId = user?.id ?? null;

    // Enforce per-user storage quota before saving results
    try {
      await checkStorageQuota(userId);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 413;
      return reply.status(statusCode).send({ error: (err as Error).message });
    }

    let fileBuffer: Buffer | null = null;
    let filename = "result";
    let parentId: string | null = null;
    let toolId: string | null = null;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
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

    const nextVersion = parent.version + 1;

    // Build the tool chain: append the new toolId to the parent's chain
    const existingChain: string[] = parent.toolChain ?? [];
    const newChain = toolId ? [...existingChain, toolId] : existingChain;

    // Determine the original filename (preserve parent's name, update extension)
    const ext = extname(filename) || extname(parent.originalName);
    const baseName = parent.originalName.replace(/\.[^.]+$/, "");
    const resultName = `${baseName}${ext}`;

    const mimeType = isValidImage ? formatToMime(validation.format) : extToMime(ext);

    // Sanitize SVG results to prevent XXE, SSRF, and script injection
    const safeResultBuffer = isSvgBuffer(fileBuffer) ? sanitizeSvg(fileBuffer) : fileBuffer;

    // Re-check quota with actual file size before persisting
    try {
      await checkStorageQuota(userId, safeResultBuffer.length);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 413;
      return reply.status(statusCode).send({ error: (err as Error).message });
    }

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
        width: isValidImage ? validation.width : null,
        height: isValidImage ? validation.height : null,
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
