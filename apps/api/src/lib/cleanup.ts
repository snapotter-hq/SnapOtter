import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { logger } from "./logger.js";
import { parseNumericSettingValue } from "./settings-helpers.js";

/**
 * Read the temp file max age from DB settings, falling back to env var only
 * when no setting row is stored. Invalid stored values log a warning and
 * return 0, and database read errors propagate so the caller skips the sweep
 * rather than silently shortening retention (#1525, #2752).
 * Called each cleanup cycle so changes take effect without restart.
 */
export async function getMaxAgeMs(): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "tempFileMaxAgeHours"));
  if (!row) {
    return env.FILE_MAX_AGE_HOURS * 60 * 60 * 1000;
  }
  return parseNumericSettingValue("tempFileMaxAgeHours", row.value, 0) * 60 * 60 * 1000;
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
