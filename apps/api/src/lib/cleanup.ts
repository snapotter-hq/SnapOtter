import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { logger } from "./logger.js";

/**
 * Read the temp file max age from DB settings, falling back to env var when no
 * valid setting row is stored. Database read errors propagate so the caller can
 * skip the sweep rather than silently shortening retention (#1525).
 * Called each cleanup cycle so changes take effect without restart.
 */
export async function getMaxAgeMs(): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "tempFileMaxAgeHours"));
  if (row) {
    const hours = parseFloat(row.value);
    if (!Number.isNaN(hours) && hours > 0) return hours * 60 * 60 * 1000;
  }
  return env.FILE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Check whether startup cleanup should run.
 * Returns true by default; returns false when explicitly set to "false" or
 * when reading the setting fails (so a transient DB error does not run an
 * unrequested startup sweep; the repeatable storageTtl job still runs).
 */
export async function shouldRunStartupCleanup(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "startupCleanup"));
    return row ? row.value !== "false" : true;
  } catch (err) {
    logger.error({ err }, "Startup cleanup: startupCleanup read failed; skipping startup sweep");
    return false;
  }
}
