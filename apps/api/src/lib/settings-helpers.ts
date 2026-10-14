import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logger } from "./logger.js";
import { getSettingPolicy } from "./settings-policy.js";

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
 * Validate a stored numeric setting string against its policy schema (when one
 * is registered) or finite-number parsing, falling back to `defaultValue` with
 * a warning when the stored value is blank, non-numeric, or out of range (#1713).
 * Returns `defaultValue` without logging when `raw` is `undefined` (key absent).
 */
export function parseNumericSettingValue(
  key: string,
  raw: string | undefined,
  defaultValue = 0,
): number {
  if (raw === undefined) return defaultValue;
  if (raw.trim() !== "") {
    const schema = getSettingPolicy(key)?.schema;
    if (schema) {
      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        const num = Number(parsed.data);
        if (Number.isFinite(num)) return num;
      }
    } else {
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
  }
  logger.warn({ key, value: raw }, "invalid numeric setting, using default");
  return defaultValue;
}

/**
 * Read a numeric setting from the DB `settings` table.
 * Returns `defaultValue` when the key is missing, blank, invalid, or on DB error.
 */
export async function getSettingNumber(key: string, defaultValue = 0): Promise<number> {
  let raw: string | undefined;
  try {
    raw = await getSettingStrict(key);
  } catch (err) {
    logger.warn({ err, key }, "setting read failed, using default");
    return defaultValue;
  }
  return parseNumericSettingValue(key, raw, defaultValue);
}

/**
 * Read a string setting from the DB `settings` table.
 * Returns `defaultValue` when the key is missing or on DB error.
 */
export async function getSettingString(key: string, defaultValue = ""): Promise<string> {
  try {
    const raw = await getSettingStrict(key);
    return raw ?? defaultValue;
  } catch (err) {
    logger.warn({ err, key }, "setting read failed, using default");
    return defaultValue;
  }
}

/**
 * Read a setting and let a database fault throw, unlike getSettingString,
 * which answers its default on any error. For gates where the default would
 * quietly relax a restriction: the caller decides what a fault means.
 * Returns undefined when the key is missing.
 */
export async function getSettingStrict(key: string): Promise<string | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row?.value;
}
