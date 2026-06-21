import { readFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { join } from "node:path";
import { APP_VERSION } from "@snapotter/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config.js";
import { db, schema } from "../../db/index.js";
import { pingRedis } from "../../jobs/connection.js";
import { requirePermission } from "../../permissions.js";

function requireUpgradeFeature(reply: FastifyReply): Promise<boolean> {
  return (async () => {
    try {
      const { isFeatureEnabled } = await import("@snapotter/enterprise");
      if (isFeatureEnabled("upgrade_management")) return true;
    } catch {
      // Enterprise package not available
    }
    reply.status(403).send({
      error: "Upgrade management requires a license with the upgrade_management feature",
    });
    return false;
  })();
}

function readJournal(): { version: string; entries: JournalEntry[] } | null {
  try {
    const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");
    return JSON.parse(readFileSync(journalPath, "utf-8"));
  } catch {
    return null;
  }
}

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export async function registerUpgradeRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/version
  app.get("/api/v1/admin/version", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("system:health")(request, reply);
    if (!user) return;
    if (!(await requireUpgradeFeature(reply))) return;

    const journal = readJournal();
    const lastEntry = journal?.entries.at(-1);

    return reply.send({
      version: APP_VERSION,
      buildDate: process.env.BUILD_DATE || null,
      nodeVersion: process.version,
      schemaVersion: lastEntry ? String(lastEntry.idx).padStart(4, "0") : null,
      pendingMigrations: 0,
    });
  });

  // GET /api/v1/admin/migrations/pending
  app.get(
    "/api/v1/admin/migrations/pending",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("system:health")(request, reply);
      if (!user) return;
      if (!(await requireUpgradeFeature(reply))) return;

      const journal = readJournal();
      if (!journal) {
        return reply.status(500).send({ error: "Could not read migration journal" });
      }

      // Try to read applied migrations from DB
      let applied: string[] = [];
      try {
        const rows = await db.execute(
          sql`SELECT hash FROM __drizzle_migrations ORDER BY created_at`,
        );
        applied = (rows.rows as { hash: string }[]).map((r) => r.hash);
      } catch {
        // Table may not exist yet
      }

      const migrations = journal.entries.map((entry) => ({
        idx: entry.idx,
        tag: entry.tag,
        when: entry.when,
        applied: applied.includes(entry.tag),
      }));

      const appliedCount = migrations.filter((m) => m.applied).length;

      return reply.send({
        migrations,
        appliedCount,
        totalCount: journal.entries.length,
      });
    },
  );

  // GET /api/v1/admin/upgrade-check
  app.get(
    "/api/v1/admin/upgrade-check",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("system:health")(request, reply);
      if (!user) return;
      if (!(await requireUpgradeFeature(reply))) return;

      // Check database connectivity
      let dbOk = false;
      try {
        await db.select().from(schema.settings).limit(1);
        dbOk = true;
      } catch {
        /* db unreachable */
      }

      // Check Redis connectivity
      let redisOk = false;
      try {
        redisOk = await pingRedis();
      } catch {
        /* redis unreachable */
      }

      // Check in-flight jobs
      let activeCount = 0;
      let noInFlightJobs = true;
      try {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.jobs)
          .where(sql`${schema.jobs.status} IN ('queued', 'processing')`);
        activeCount = row?.count ?? 0;
        noInFlightJobs = activeCount === 0;
      } catch {
        // If we can't query, assume there may be jobs
        noInFlightJobs = false;
      }

      // Check disk space (> 1 GB free)
      const MIN_FREE_BYTES = 1024 * 1024 * 1024; // 1 GB
      let diskOk = true;
      let freeGb = 0;
      if (env.STORAGE_MODE !== "s3") {
        try {
          const stats = await statfs(env.WORKSPACE_PATH);
          const freeBytes = stats.bfree * stats.bsize;
          freeGb = Math.round((freeBytes / (1024 * 1024 * 1024)) * 100) / 100;
          diskOk = freeBytes > MIN_FREE_BYTES;
        } catch {
          // Path doesn't exist -- skip check
        }
      }

      const ready = diskOk && noInFlightJobs && dbOk && redisOk;

      return reply.send({
        ready,
        checks: {
          diskSpace: { ok: diskOk, freeGb },
          inFlightJobs: { ok: noInFlightJobs, activeCount },
          databaseConnected: { ok: dbOk },
          redisConnected: { ok: redisOk },
        },
      });
    },
  );

  app.log.info("Enterprise upgrade management routes registered");
}
