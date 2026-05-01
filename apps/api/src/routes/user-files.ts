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
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { and, desc, eq, like, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { db, schema, sqlite } from "../db/index.js";
import { auditLog } from "../lib/audit.js";
import {
  deleteStoredFile,
  deleteThumbnail,
  getCachedThumbnail,
  getStoredFilePath,
  saveFile,
  saveThumbnail,
} from "../lib/file-storage.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { ensureSharpCompat } from "../lib/heic-converter.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";
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
    toolChain: row.toolChain ? JSON.parse(row.toolChain) : [],
    createdAt: row.createdAt.toISOString(),
  };
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
      if (!hasEffectivePermission(user, "files:all")) {
        conditions.push(eq(schema.userFiles.userId, user.id));
      }

      if (search) {
        const escaped = search.replace(/[%_\\]/g, "\\$&");
        conditions.push(like(schema.userFiles.originalName, `%${escaped}%`));
      }

      const rows = db
        .select()
        .from(schema.userFiles)
        .where(and(...conditions))
        .orderBy(desc(schema.userFiles.createdAt))
        .limit(limit)
        .offset(offset)
        .all();

      // Total count (for pagination)
      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.userFiles)
        .where(and(...conditions))
        .get();

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
  app.post("/api/v1/files/upload", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getAuthUser(request);
    const userId = user?.id ?? null;

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

      // Validate image
      const validation = await validateImageBuffer(buffer, part.filename);
      if (!validation.valid) {
        return reply.status(400).send({
          error: `Invalid file "${part.filename}": ${validation.reason}`,
        });
      }

      // Sanitize SVG uploads to prevent XXE, SSRF, and script injection
      const safeBuffer = isSvgBuffer(buffer) ? sanitizeSvg(buffer) : buffer;

      const safeName = sanitizeFilename(part.filename ?? "upload");
      const mimeType = formatToMime(validation.format);

      // Persist to disk
      const storedName = await saveFile(safeBuffer, safeName);

      // Create DB record
      const id = randomUUID();
      try {
        db.insert(schema.userFiles)
          .values({
            id,
            userId,
            originalName: safeName,
            storedName,
            mimeType,
            size: safeBuffer.length,
            width: validation.width,
            height: validation.height,
            version: 1,
            parentId: null,
            toolChain: null,
          })
          .run();
      } catch {
        return reply.status(409).send({ error: "Failed to save file record" });
      }

      const row = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();

      if (row) created.push(serializeFile(row));
    }

    if (created.length === 0) {
      return reply.status(400).send({ error: "No valid files uploaded" });
    }

    auditLog(request.log, "FILE_UPLOADED", {
      userId,
      count: created.length,
      files: created.map((f) => f.originalName),
    });

    return reply.status(201).send({ files: created });
  });

  /**
   * GET /api/v1/files/:id
   *
   * Returns full metadata for a file plus the complete version chain
   * (from the root ancestor down through every version to the latest).
   */
  app.get(
    "/api/v1/files/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      const file = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();

      if (!file || (file.userId !== user.id && !hasEffectivePermission(user, "files:all"))) {
        return reply.status(404).send({ error: "File not found" });
      }

      // Walk the full version chain using a recursive CTE.
      // First find the root ancestor, then collect all descendants.
      interface ChainRow {
        id: string;
        original_name: string;
        mime_type: string;
        size: number;
        width: number | null;
        height: number | null;
        version: number;
        parent_id: string | null;
        tool_chain: string | null;
        created_at: number;
      }

      const chainRows = sqlite
        .prepare(`
          WITH RECURSIVE
          ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM user_files WHERE id = ?
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
        `)
        .all(id) as ChainRow[];

      const versions = chainRows.map((r) => ({
        id: r.id,
        originalName: r.original_name,
        mimeType: r.mime_type,
        size: r.size,
        width: r.width,
        height: r.height,
        version: r.version,
        parentId: r.parent_id,
        toolChain: r.tool_chain ? JSON.parse(r.tool_chain) : [],
        createdAt: new Date(r.created_at * 1000).toISOString(),
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
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      const file = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();

      if (!file || (file.userId !== user.id && !hasEffectivePermission(user, "files:all"))) {
        return reply.status(404).send({ error: "File not found" });
      }

      const filePath = getStoredFilePath(file.storedName);

      const stream = createReadStream(filePath);
      stream.on("error", () => {
        if (!reply.raw.headersSent) {
          reply.status(404).send({ error: "File not found on disk" });
        }
      });

      return reply
        .header("Content-Type", file.mimeType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(file.originalName)}"`,
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
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      const file = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();

      if (!file || (file.userId !== user.id && !hasEffectivePermission(user, "files:all"))) {
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

      const filePath = getStoredFilePath(file.storedName);

      try {
        // Read file and decode HEIC/HEIF if needed before Sharp processing
        const fileBuffer = await ensureSharpCompat(await readFile(filePath));

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
  app.delete("/api/v1/files", async (request: FastifyRequest, reply: FastifyReply) => {
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

    let deletedCount = 0;

    interface DeleteChainRow {
      id: string;
      stored_name: string;
    }

    for (const id of ids) {
      // Ownership check: non-admin users can only delete their own files
      const file = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();
      if (!file || (file.userId !== user.id && !hasEffectivePermission(user, "files:all")))
        continue;
      // Collect all files in the chain using a recursive CTE
      const chainRows = sqlite
        .prepare(`
            WITH RECURSIVE chain(id, stored_name) AS (
              SELECT f.id, f.stored_name
              FROM user_files f
              WHERE f.id = (
                WITH RECURSIVE ancestors(id, parent_id) AS (
                  SELECT id, parent_id FROM user_files WHERE id = ?
                  UNION ALL
                  SELECT uf.id, uf.parent_id FROM user_files uf
                  INNER JOIN ancestors a ON uf.id = a.parent_id
                )
                SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1
              )
              UNION ALL
              SELECT child.id, child.stored_name
              FROM user_files child
              INNER JOIN chain c ON child.parent_id = c.id
            )
            SELECT id, stored_name FROM chain
          `)
        .all(id) as DeleteChainRow[];

      for (const row of chainRows) {
        await deleteStoredFile(row.stored_name);
        await deleteThumbnail(row.stored_name);
        db.delete(schema.userFiles).where(eq(schema.userFiles.id, row.id)).run();
        deletedCount++;
      }
    }

    auditLog(request.log, "FILE_DELETED", { userId: user.id, count: deletedCount, ids });

    return reply.send({ deleted: deletedCount });
  });

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

    // Validate the image
    const validation = await validateImageBuffer(fileBuffer, filename);
    if (!validation.valid) {
      return reply.status(400).send({
        error: `Invalid file: ${validation.reason}`,
      });
    }

    // Look up the parent to compute the next version and carry forward the tool chain
    const parent = db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, parentId))
      .get();

    if (!parent) {
      return reply.status(404).send({ error: "Parent file not found" });
    }

    const nextVersion = parent.version + 1;

    // Build the tool chain: append the new toolId to the parent's chain
    const existingChain: string[] = parent.toolChain ? JSON.parse(parent.toolChain) : [];
    const newChain = toolId ? [...existingChain, toolId] : existingChain;

    // Determine the original filename (preserve parent's name, update extension)
    const ext = extname(filename) || extname(parent.originalName);
    const baseName = parent.originalName.replace(/\.[^.]+$/, "");
    const resultName = `${baseName}${ext}`;

    const mimeType = formatToMime(validation.format) || extToMime(ext);

    // Sanitize SVG results to prevent XXE, SSRF, and script injection
    const safeResultBuffer = isSvgBuffer(fileBuffer) ? sanitizeSvg(fileBuffer) : fileBuffer;

    // Persist to disk
    const storedName = await saveFile(safeResultBuffer, resultName);

    // Create DB record
    const id = randomUUID();
    try {
      db.insert(schema.userFiles)
        .values({
          id,
          userId,
          originalName: resultName,
          storedName,
          mimeType,
          size: safeResultBuffer.length,
          width: validation.width,
          height: validation.height,
          version: nextVersion,
          parentId,
          toolChain: JSON.stringify(newChain),
        })
        .run();
    } catch {
      return reply.status(409).send({ error: "Failed to save result record" });
    }

    const row = db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id)).get();

    return reply.status(201).send({ file: row ? serializeFile(row) : null });
  });

  app.log.info("User file routes registered");
}
