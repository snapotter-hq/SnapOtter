/**
 * Assemble a diagnostic support bundle as a zip stream.
 *
 * Contents:
 *   logs/<file>        -- all log files from LOG_DIR
 *   config.json        -- redacted env + version metadata
 *   db-counts.json     -- row counts per table
 *   failed-jobs.json   -- last 20 failed/canceled jobs
 *   host.json          -- OS / hardware snapshot
 */
import { readdirSync, readFileSync, statfsSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { APP_VERSION } from "@snapotter/shared";
import archiver from "archiver";
import { desc, inArray, sql } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";

// Keys whose values are fully replaced with "<redacted>"
const REDACT_PATTERN = /PASSWORD|SECRET|KEY|DSN/i;

// Keys that get userinfo-only redaction
const URL_REDACT_KEYS = new Set(["DATABASE_URL", "REDIS_URL"]);

function redactEnv(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if (URL_REDACT_KEYS.has(key) && typeof value === "string") {
      out[key] = value.replace(/:\/\/[^@]*@/, "://***@");
    } else if (REDACT_PATTERN.test(key)) {
      out[key] = "<redacted>";
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function dbCounts(): Promise<Array<{ relname: string; n_live_tup: number }>> {
  try {
    const { rows } = await db.execute(
      sql`SELECT relname, n_live_tup::int AS n_live_tup FROM pg_stat_user_tables ORDER BY relname`,
    );
    return rows as Array<{ relname: string; n_live_tup: number }>;
  } catch {
    return [];
  }
}

async function failedJobs(): Promise<unknown[]> {
  try {
    const rows = await db
      .select({
        id: schema.jobs.id,
        toolId: schema.jobs.toolId,
        pool: schema.jobs.pool,
        error: schema.jobs.error,
        createdAt: schema.jobs.createdAt,
        durationMs: schema.jobs.durationMs,
      })
      .from(schema.jobs)
      .where(inArray(schema.jobs.status, ["failed", "canceled"]))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(20);
    return rows;
  } catch {
    return [];
  }
}

function hostInfo(): Record<string, unknown> {
  const info: Record<string, unknown> = {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
  };
  try {
    const stats = statfsSync(env.WORKSPACE_PATH);
    info.workspaceFreeBytes = stats.bfree * stats.bsize;
  } catch {
    info.workspaceFreeBytes = null;
  }
  return info;
}

/**
 * Build the support bundle zip and return it as a readable stream.
 * The caller is responsible for piping it to the HTTP response.
 */
export function buildSupportBundle(): Readable {
  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.pipe(passthrough);
  archive.on("error", (err) => passthrough.destroy(err));

  // Kick off the async assembly without blocking the return.
  // Errors are forwarded to the passthrough so the HTTP layer sees them.
  (async () => {
    try {
      // 1. Log files
      try {
        const files = readdirSync(env.LOG_DIR);
        for (const file of files) {
          const full = join(env.LOG_DIR, file);
          try {
            const content = readFileSync(full);
            archive.append(content, { name: `logs/${file}` });
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // LOG_DIR missing -- skip silently
      }

      // 2. Redacted config
      const config = {
        ...redactEnv(),
        version: APP_VERSION,
        node: process.version,
      };
      archive.append(JSON.stringify(config, null, 2), { name: "config.json" });

      // 3. DB table counts
      const counts = await dbCounts();
      archive.append(JSON.stringify(counts, null, 2), { name: "db-counts.json" });

      // 4. Failed jobs
      const jobs = await failedJobs();
      archive.append(JSON.stringify(jobs, null, 2), { name: "failed-jobs.json" });

      // 5. Host info
      const host = hostInfo();
      archive.append(JSON.stringify(host, null, 2), { name: "host.json" });

      await archive.finalize();
    } catch (err) {
      archive.destroy();
      passthrough.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return passthrough;
}
