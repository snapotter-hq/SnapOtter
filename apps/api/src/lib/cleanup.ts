import { mkdirSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { eq, lt } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";

/**
 * Read the temp file max age from DB settings, falling back to env var.
 * Called each cleanup cycle so changes take effect without restart.
 */
export async function getMaxAgeMs(): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "tempFileMaxAgeHours"));
    if (row) {
      const hours = parseFloat(row.value);
      if (!Number.isNaN(hours) && hours > 0) return hours * 60 * 60 * 1000;
    }
  } catch {
    /* DB not ready yet, use env */
  }
  return env.FILE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Check whether startup cleanup should run.
 * Returns true by default; only returns false when explicitly set to "false".
 */
export async function shouldRunStartupCleanup(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "startupCleanup"));
    return row ? row.value !== "false" : true;
  } catch {
    return true;
  }
}

export async function startCleanupCron(): Promise<{ stop: () => void }> {
  try {
    mkdirSync(env.WORKSPACE_PATH, { recursive: true });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES") {
      console.error(
        `WARNING: Cannot create workspace directory "${env.WORKSPACE_PATH}". Check volume permissions (PUID/PGID).`,
      );
    }
    throw err;
  }

  const intervalMs = env.CLEANUP_INTERVAL_MINUTES * 60 * 1000;

  const cleanup = async () => {
    const maxAgeMs = await getMaxAgeMs();
    try {
      const entries = await readdir(env.WORKSPACE_PATH, { withFileTypes: true }).catch(() => []);
      const now = Date.now();
      let cleaned = 0;

      for (const entry of entries) {
        const fullPath = join(env.WORKSPACE_PATH, entry.name);
        try {
          const stats = await stat(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await rm(fullPath, { recursive: true });
            cleaned++;
          }
        } catch {
          // Skip files that can't be stat'd
        }
      }

      if (cleaned > 0) {
        console.log(`Cleanup: removed ${cleaned} expired workspace entries`);
      }
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  };

  // Purge expired sessions from the database
  const purgeExpiredSessions = async () => {
    try {
      const now = new Date();
      const result = await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now));
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Cleanup: purged ${result.rowCount} expired sessions`);
      }
    } catch (err) {
      console.error("Session cleanup error:", err);
    }
  };

  // Run on startup only if setting allows it
  if (await shouldRunStartupCleanup()) {
    cleanup();
    purgeExpiredSessions();
  }

  // Schedule recurring cleanup
  const cleanupTimer = setInterval(cleanup, intervalMs);
  const sessionTimer = setInterval(purgeExpiredSessions, 60 * 60 * 1000); // Hourly
  console.log(
    `Cleanup scheduled: every ${env.CLEANUP_INTERVAL_MINUTES}m, max age configurable (env default: ${env.FILE_MAX_AGE_HOURS}h)`,
  );

  return {
    stop: () => {
      clearInterval(cleanupTimer);
      clearInterval(sessionTimer);
    },
  };
}
