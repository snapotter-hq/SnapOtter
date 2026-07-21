import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  getSettingNumber,
  getSettingString,
  setSettingIfAbsent,
  upsertSetting,
} from "../../../apps/api/src/lib/settings-helpers.js";

const prefix = `test-sh-${randomUUID().slice(0, 8)}`;
let keyCounter = 0;

function uniqueKey(): string {
  return `${prefix}-${++keyCounter}`;
}

async function cleanupKey(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

const keysToClean: string[] = [];

afterAll(async () => {
  for (const key of keysToClean) {
    await cleanupKey(key);
  }
});

describe("upsertSetting", () => {
  it("inserts a new setting", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    await upsertSetting(key, "hello");

    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("hello");
  });

  it("updates an existing setting", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    await upsertSetting(key, "first");
    await upsertSetting(key, "second");

    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("second");
  });

  it("handles empty string value", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    await upsertSetting(key, "");

    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("");
  });
});

describe("getSettingNumber", () => {
  it("returns the number when setting exists", async () => {
    const key = uniqueKey();
    keysToClean.push(key);
    await upsertSetting(key, "42");

    const result = await getSettingNumber(key);
    expect(result).toBe(42);
  });

  it("returns defaultValue when setting does not exist", async () => {
    const key = uniqueKey();
    const result = await getSettingNumber(key, 99);
    expect(result).toBe(99);
  });

  it("returns defaultValue when setting value is NaN", async () => {
    const key = uniqueKey();
    keysToClean.push(key);
    await upsertSetting(key, "not-a-number");

    const result = await getSettingNumber(key, 7);
    expect(result).toBe(7);
  });

  it("defaults defaultValue to 0", async () => {
    const key = uniqueKey();
    const result = await getSettingNumber(key);
    expect(result).toBe(0);
  });
});

describe("getSettingString", () => {
  it("returns the string when setting exists", async () => {
    const key = uniqueKey();
    keysToClean.push(key);
    await upsertSetting(key, "stored-value");

    const result = await getSettingString(key);
    expect(result).toBe("stored-value");
  });

  it("returns defaultValue when setting does not exist", async () => {
    const key = uniqueKey();
    const result = await getSettingString(key, "fallback");
    expect(result).toBe("fallback");
  });

  it("defaults defaultValue to empty string", async () => {
    const key = uniqueKey();
    const result = await getSettingString(key);
    expect(result).toBe("");
  });
});

describe("setSettingIfAbsent", () => {
  it("writes the value when the key is absent", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    await setSettingIfAbsent(key, "first");

    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("first");
  });

  it("keeps the first value and ignores later writes (first-write-wins)", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    await setSettingIfAbsent(key, "first");
    await setSettingIfAbsent(key, "second");

    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("first");
  });
});
