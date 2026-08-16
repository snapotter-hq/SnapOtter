import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { clearUserMfa } from "../../../apps/api/src/lib/user-mfa.js";

async function insertEnrolledUser() {
  const id = randomUUID();
  const username = `clearmfa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.users).values({
    id,
    username,
    totpSecret: "encrypted-secret",
    totpEnabled: true,
    recoveryCodesHash: "hash1,hash2",
  });
  return { id, username };
}

describe("clearUserMfa", () => {
  it("nulls totpSecret, totpEnabled, and recoveryCodesHash", async () => {
    const { id } = await insertEnrolledUser();
    await clearUserMfa(id);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.totpSecret).toBeNull();
    expect(row.totpEnabled).toBe(false);
    expect(row.recoveryCodesHash).toBeNull();
  });

  it("is a no-op-safe idempotent second call", async () => {
    const { id } = await insertEnrolledUser();
    await clearUserMfa(id);
    await clearUserMfa(id);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.totpEnabled).toBe(false);
  });
});
