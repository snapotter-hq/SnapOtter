import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * The anonymous id on every analytics event and Sentry error, created once and
 * kept in the settings table. An existing row always wins; `seed`
 * (SNAPOTTER_INSTANCE_ID, already validated by the env schema) is used only on
 * first boot.
 */
export async function ensureInstanceId(seed: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "instance_id"));
  if (existing) return existing.value;
  const value = seed || randomUUID();
  await db.insert(schema.settings).values({ key: "instance_id", value });
  return value;
}
