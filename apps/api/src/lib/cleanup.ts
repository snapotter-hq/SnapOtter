import { eq } from "drizzle-orm";
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
