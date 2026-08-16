import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { resetMfaPolicy } from "../../../apps/api/src/scripts/mfa-recover.js";

async function readPolicy(): Promise<string | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, "mfaPolicy"));
  return row?.value;
}

async function countAudit(action: string): Promise<number> {
  const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action));
  return rows.length;
}

describe("resetMfaPolicy", () => {
  it("sets mfaPolicy to optional even when it was required", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    await resetMfaPolicy();

    expect(await readPolicy()).toBe("optional");
  });

  it("writes a SETTINGS_UPDATED audit row", async () => {
    const before = await countAudit("SETTINGS_UPDATED");
    await resetMfaPolicy();
    expect(await countAudit("SETTINGS_UPDATED")).toBe(before + 1);
  });
});
