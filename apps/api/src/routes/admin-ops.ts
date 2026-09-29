/**
 * Admin operations routes -- runtime log level, Prometheus metrics,
 * diagnostic support bundle, usage dashboard, and backup status tracking.
 *
 * GET  /api/v1/admin/log-level        -- read current pino log level
 * POST /api/v1/admin/log-level        -- change level at runtime
 * GET  /api/v1/metrics                -- Prometheus scrape endpoint
 * GET  /api/v1/admin/support-bundle   -- download redacted diagnostic zip
 * GET  /api/v1/admin/usage            -- local usage dashboard data
 * POST /api/v1/admin/backup-status    -- record backup completion
 * GET  /api/v1/admin/backup-status    -- read last backup info + staleness
 */
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { formatZodErrors } from "../lib/errors.js";
import { metricsText } from "../lib/metrics.js";
import { buildSupportBundle } from "../lib/support-bundle.js";
import { requirePermission } from "../permissions.js";

const logLevelSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
});

export async function adminOpsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/log-level
  app.get("/api/v1/admin/log-level", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
    if (!admin) return;
    return { level: app.log.level };
  });

  // POST /api/v1/admin/log-level
  app.post("/api/v1/admin/log-level", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
    if (!admin) return;
    const parsed = logLevelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid log level",
        code: "VALIDATION_ERROR",
        details: formatZodErrors(parsed.error.issues),
      });
    }
    app.log.level = parsed.data.level;
    return { level: app.log.level };
  });

  // GET /api/v1/metrics -- Prometheus scrape endpoint
  app.get("/api/v1/metrics", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;
    const text = await metricsText();
    return reply.type("text/plain; version=0.0.4").send(text);
  });

  // GET /api/v1/admin/support-bundle -- download diagnostic zip
  app.get("/api/v1/admin/support-bundle", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;
    const date = new Date().toISOString().slice(0, 10);
    const stream = buildSupportBundle();
    return reply
      .type("application/zip")
      .header("Content-Disposition", `attachment; filename=snapotter-support-${date}.zip`)
      .send(stream);
  });

  // GET /api/v1/admin/usage -- local usage dashboard data
  const usageQuerySchema = z.object({
    days: z
      .string()
      .optional()
      .transform((v) => {
        const n = v ? Number(v) : 30;
        if (Number.isNaN(n)) return 30;
        return Math.max(1, Math.min(365, Math.round(n)));
      }),
  });

  app.get("/api/v1/admin/usage", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("audit:read")(request, reply);
    if (!admin) return;

    const parsed = usageQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        code: "VALIDATION_ERROR",
        details: formatZodErrors(parsed.error.issues),
      });
    }
    const days = parsed.data.days;

    // Jobs per day
    const jobsPerDayResult = await db.execute(
      sql`SELECT date_trunc('day', created_at)::date::text AS day, count(*)::int AS total,
             count(*) FILTER (WHERE status = 'completed')::int AS completed,
             count(*) FILTER (WHERE status = 'failed')::int AS failed
           FROM jobs WHERE created_at > now() - make_interval(days => ${days})
           GROUP BY 1 ORDER BY 1`,
    );

    // Top tools
    const topToolsResult = await db.execute(
      sql`SELECT tool_id, count(*)::int AS runs FROM jobs
           WHERE tool_id IS NOT NULL AND created_at > now() - make_interval(days => ${days})
           GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    );

    // Per user
    const perUserResult = await db.execute(
      sql`SELECT u.username, count(*)::int AS runs, coalesce(sum(j.bytes_in), 0)::text AS bytes_in
           FROM jobs j LEFT JOIN users u ON u.id = j.user_id
           WHERE j.created_at > now() - make_interval(days => ${days})
           GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    );

    // Duration percentiles
    const durationsResult = await db.execute(
      sql`SELECT pool,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
           FROM jobs WHERE duration_ms IS NOT NULL AND created_at > now() - make_interval(days => ${days})
           GROUP BY pool`,
    );

    // Storage totals
    const storageResult = await db.execute(
      sql`SELECT coalesce(sum(size), 0)::text AS bytes, count(*)::int AS files FROM user_files`,
    );

    // Per-team storage breakdown from pre-computed user counters. users.team
    // holds a team id (#1474): label by the team's name, falling back to the
    // raw value for a user whose team row is gone.
    const teamName = sql<string>`coalesce(${schema.teams.name}, ${schema.users.team})`;
    const teamStorageRows = await db
      .select({
        teamName,
        totalBytes: sql<string>`coalesce(sum(${schema.users.storageUsed}), 0)::text`,
        userCount: sql<number>`count(*)::int`,
      })
      .from(schema.users)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.users.team))
      .groupBy(teamName);

    const jobsPerDay = (jobsPerDayResult.rows as Array<Record<string, unknown>>).map((r) => ({
      day: String(r.day),
      total: Number(r.total),
      completed: Number(r.completed),
      failed: Number(r.failed),
    }));

    const topTools = (topToolsResult.rows as Array<Record<string, unknown>>).map((r) => ({
      toolId: String(r.tool_id),
      runs: Number(r.runs),
    }));

    const perUser = (perUserResult.rows as Array<Record<string, unknown>>).map((r) => ({
      username: r.username != null ? String(r.username) : null,
      runs: Number(r.runs),
      bytesIn: String(r.bytes_in),
    }));

    const durations = (durationsResult.rows as Array<Record<string, unknown>>).map((r) => ({
      pool: String(r.pool),
      p50Ms: r.p50 != null ? Math.round(Number(r.p50)) : null,
      p95Ms: r.p95 != null ? Math.round(Number(r.p95)) : null,
    }));

    const storageRow = (storageResult.rows as Array<Record<string, unknown>>)[0] || {
      bytes: "0",
      files: 0,
    };
    const storage = {
      libraryBytes: String(storageRow.bytes),
      libraryFiles: Number(storageRow.files),
    };

    const teamStorage = teamStorageRows.map((r) => ({
      teamName: r.teamName,
      totalBytes: r.totalBytes,
      userCount: r.userCount,
    }));

    return {
      days,
      jobsPerDay,
      topTools,
      perUser,
      durations,
      storage,
      teamStorage,
    };
  });

  // ---------------------------------------------------------------------------
  // Backup status tracking
  // ---------------------------------------------------------------------------

  const backupStatusSchema = z.object({
    type: z.string().min(1),
    sizeBytes: z.number().optional(),
    notes: z.string().optional(),
  });

  const BACKUP_KEY = "backup_last_completed";

  // POST /api/v1/admin/backup-status -- record backup completion
  app.post("/api/v1/admin/backup-status", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;

    const parsed = backupStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid backup status",
        code: "VALIDATION_ERROR",
        details: formatZodErrors(parsed.error.issues),
      });
    }

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      timestamp,
      type: parsed.data.type,
      sizeBytes: parsed.data.sizeBytes ?? null,
      notes: parsed.data.notes ?? "",
    });

    const [existing] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, BACKUP_KEY));

    if (existing) {
      await db
        .update(schema.settings)
        .set({ value: payload, updatedAt: new Date() })
        .where(eq(schema.settings.key, BACKUP_KEY));
    } else {
      await db.insert(schema.settings).values({ key: BACKUP_KEY, value: payload });
    }

    return { success: true, timestamp };
  });

  // GET /api/v1/admin/backup-status -- read last backup info + staleness
  app.get("/api/v1/admin/backup-status", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;

    const result = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, BACKUP_KEY))
      .limit(1);

    if (result.length === 0) {
      return { lastBackup: null, status: "critical", ageHours: null };
    }

    let lastBackup: Record<string, unknown>;
    try {
      lastBackup = JSON.parse(result[0].value);
    } catch {
      return { lastBackup: null, status: "critical", ageHours: null };
    }

    const ts = new Date(lastBackup.timestamp as string);
    const ageMs = Date.now() - ts.getTime();
    const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;

    let status: "ok" | "warning" | "critical";
    if (ageHours < 24) {
      status = "ok";
    } else if (ageHours < 48) {
      status = "warning";
    } else {
      status = "critical";
    }

    return { lastBackup, status, ageHours };
  });
}
