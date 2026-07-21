import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Atomically insert or update a setting using Postgres ON CONFLICT DO UPDATE.
 * Eliminates the TOCTOU race in the old SELECT-then-INSERT/UPDATE pattern.
 */
export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Insert a setting only if the key does not already exist (first-write-wins).
 * Uses ON CONFLICT DO NOTHING, so repeated calls are cheap no-ops after the
 * first and the original value is preserved. Used for one-time markers like the
 * instance's first successful processing that gate the onboarding survey.
 */
export async function setSettingIfAbsent(key: string, value: string): Promise<void> {
  await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
}

/**
 * Read a numeric setting from the DB `settings` table.
 * Returns `defaultValue` when the key is missing, non-numeric, or on DB error.
 */
export async function getSettingNumber(key: string, defaultValue = 0): Promise<number> {
  try {
    const result = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1);
    if (result.length > 0) {
      const num = Number(result[0].value);
      if (!Number.isNaN(num)) return num;
    }
  } catch {
    /* DB not ready or key absent -- fall through */
  }
  return defaultValue;
}

/**
 * Read a string setting from the DB `settings` table.
 * Returns `defaultValue` when the key is missing or on DB error.
 */
export async function getSettingString(key: string, defaultValue = ""): Promise<string> {
  try {
    const result = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1);
    if (result.length > 0) return result[0].value;
  } catch {
    /* DB not ready or key absent -- fall through */
  }
  return defaultValue;
}
