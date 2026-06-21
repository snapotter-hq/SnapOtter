import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import { getMaxAgeMs, shouldRunStartupCleanup } from "../../../apps/api/src/lib/cleanup.js";

beforeAll(async () => {
  await runMigrations();
});

async function setSetting(key: string, value: string) {
  const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing) {
    await db
      .update(schema.settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.settings.key, key));
  } else {
    await db.insert(schema.settings).values({ key, value });
  }
}

async function removeSetting(key: string) {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

afterEach(async () => {
  await removeSetting("tempFileMaxAgeHours");
  await removeSetting("startupCleanup");
});

describe("getMaxAgeMs", () => {
  it("returns DB value when tempFileMaxAgeHours is set", async () => {
    await setSetting("tempFileMaxAgeHours", "48");
    const result = await getMaxAgeMs();
    expect(result).toBe(48 * 60 * 60 * 1000);
  });

  it("returns env fallback when no DB setting exists", async () => {
    await removeSetting("tempFileMaxAgeHours");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for invalid (non-numeric) DB value", async () => {
    await setSetting("tempFileMaxAgeHours", "notanumber");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for zero or negative DB value", async () => {
    await setSetting("tempFileMaxAgeHours", "0");
    const result = await getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);

    await setSetting("tempFileMaxAgeHours", "-5");
    const result2 = await getMaxAgeMs();
    expect(result2).toBe(1 * 60 * 60 * 1000);
  });

  it("handles fractional hours", async () => {
    await setSetting("tempFileMaxAgeHours", "0.5");
    const result = await getMaxAgeMs();
    expect(result).toBe(0.5 * 60 * 60 * 1000);
  });
});

describe("shouldRunStartupCleanup", () => {
  it("returns false when setting is 'false'", async () => {
    await setSetting("startupCleanup", "false");
    expect(await shouldRunStartupCleanup()).toBe(false);
  });

  it("returns true when setting is 'true'", async () => {
    await setSetting("startupCleanup", "true");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true when setting is not set", async () => {
    await removeSetting("startupCleanup");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true for any value other than 'false'", async () => {
    await setSetting("startupCleanup", "yes");
    expect(await shouldRunStartupCleanup()).toBe(true);

    await setSetting("startupCleanup", "1");
    expect(await shouldRunStartupCleanup()).toBe(true);
  });
});
