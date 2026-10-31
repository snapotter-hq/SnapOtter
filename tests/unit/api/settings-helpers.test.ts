import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import {
  getSettingNumber,
  getSettingStrict,
  getSettingString,
  parseNumericSettingValue,
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

  it("treats a blank or whitespace-only stored value as unset and returns defaultValue (#1713)", async () => {
    const key = uniqueKey();
    keysToClean.push(key);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await upsertSetting(key, "");
      expect(await getSettingNumber(key, 5)).toBe(5);

      await upsertSetting(key, "   ");
      expect(await getSettingNumber(key, 5)).toBe(5);

      expect(warnSpy).toHaveBeenCalledWith(
        { key, value: "" },
        "invalid numeric setting, using default",
      );
      expect(warnSpy).toHaveBeenCalledWith(
        { key, value: "   " },
        "invalid numeric setting, using default",
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("validates stored values against the setting policy schema and falls back with a warning (#1713)", async () => {
    keysToClean.push("passwordMinLength");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      for (const invalid of ["", "0", "129", "Infinity", "3.5", "-4"]) {
        warnSpy.mockClear();
        await upsertSetting("passwordMinLength", invalid);
        expect(await getSettingNumber("passwordMinLength", 8)).toBe(8);
        expect(warnSpy).toHaveBeenCalledWith(
          { key: "passwordMinLength", value: invalid },
          "invalid numeric setting, using default",
        );
      }

      warnSpy.mockClear();
      await upsertSetting("passwordMinLength", "12");
      expect(await getSettingNumber("passwordMinLength", 8)).toBe(12);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await cleanupKey("passwordMinLength");
      warnSpy.mockRestore();
    }
  });

  it("returns 0 without warning when a zero-allowed setting stores '0' and defaultValue is non-zero (#1713)", async () => {
    keysToClean.push("loginThrottleMaxFailures");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await upsertSetting("loginThrottleMaxFailures", "0");
      expect(await getSettingNumber("loginThrottleMaxFailures", 5)).toBe(0);
      expect(warnSpy).not.toHaveBeenCalled();

      await upsertSetting("loginThrottleMaxFailures", "");
      expect(await getSettingNumber("loginThrottleMaxFailures", 5)).toBe(5);
      expect(warnSpy).toHaveBeenCalledWith(
        { key: "loginThrottleMaxFailures", value: "" },
        "invalid numeric setting, using default",
      );
    } finally {
      await cleanupKey("loginThrottleMaxFailures");
      warnSpy.mockRestore();
    }
  });

  it("rejects non-finite values even for keys without a registered policy (#1713)", async () => {
    const key = uniqueKey();
    keysToClean.push(key);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await upsertSetting(key, "Infinity");
      expect(await getSettingNumber(key, 11)).toBe(11);
      expect(warnSpy).toHaveBeenCalledWith(
        { key, value: "Infinity" },
        "invalid numeric setting, using default",
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("logs a warning and returns defaultValue when the DB query rejects (#1713)", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw dbError;
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const result = await getSettingNumber("maxSessionsPerUser", 3);
      expect(result).toBe(3);
      expect(warnSpy).toHaveBeenCalledWith(
        { err: dbError, key: "maxSessionsPerUser" },
        "setting read failed, using default",
      );
    } finally {
      selectSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("parseNumericSettingValue", () => {
  it("returns defaultValue without logging when raw is undefined", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      expect(parseNumericSettingValue("passwordMinLength", undefined, 8)).toBe(8);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
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

  it("logs a warning and returns defaultValue when the DB query rejects (#1713)", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw dbError;
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const result = await getSettingString("ipAllowlist", "[]");
      expect(result).toBe("[]");
      expect(warnSpy).toHaveBeenCalledWith(
        { err: dbError, key: "ipAllowlist" },
        "setting read failed, using default",
      );
    } finally {
      selectSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("getSettingStrict", () => {
  it("returns the stored string when present and undefined when absent", async () => {
    const key = uniqueKey();
    keysToClean.push(key);

    expect(await getSettingStrict(key)).toBeUndefined();
    await upsertSetting(key, "strict-value");
    expect(await getSettingStrict(key)).toBe("strict-value");
  });

  it("propagates a DB error without logging a fallback warning", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw dbError;
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await expect(getSettingStrict("ssoEnforcement")).rejects.toThrow(dbError);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      selectSpy.mockRestore();
      warnSpy.mockRestore();
    }
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
