import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  inserted: [] as Array<{ key: string; value: string }>,
  upserted: [] as Array<{ key: string; value: string }>,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (pred: { val: string }) => {
          const val = store.rows.get(pred.val);
          const result = val === undefined ? [] : [{ key: pred.val, value: val }];
          return Object.assign(Promise.resolve(result), {
            limit: () => Promise.resolve(result),
          });
        },
      }),
    }),
    insert: () => ({
      values: (row: { key: string; value: string }) => ({
        onConflictDoNothing: async () => {
          if (!store.rows.has(row.key)) {
            store.rows.set(row.key, row.value);
            store.inserted.push({ key: row.key, value: row.value });
          }
        },
        onConflictDoUpdate: async ({ set }: { set: { value: string } }) => {
          store.rows.set(row.key, set.value);
          store.upserted.push({ key: row.key, value: set.value });
        },
      }),
    }),
  },
  schema: {
    settings: {
      key: "settings.key",
      value: "settings.value",
    },
  },
}));

import { env } from "../../../apps/api/src/config.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { ensureDefaultSettings } from "../../../apps/api/src/lib/settings-helpers.js";

const originalTheme = env.DEFAULT_THEME;
const originalLocale = env.DEFAULT_LOCALE;
const originalToolView = env.DEFAULT_TOOL_VIEW;

beforeEach(() => {
  store.rows.clear();
  store.inserted.length = 0;
  store.upserted.length = 0;
  env.DEFAULT_THEME = originalTheme;
  env.DEFAULT_LOCALE = originalLocale;
  env.DEFAULT_TOOL_VIEW = originalToolView;
});

describe("ensureDefaultSettings (#3964)", () => {
  it("inserts defaultTheme, defaultLocale, and defaultToolView when absent", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      env.DEFAULT_THEME = "dark";
      env.DEFAULT_LOCALE = "de";
      env.DEFAULT_TOOL_VIEW = "fullscreen";

      await ensureDefaultSettings();

      expect(store.inserted).toEqual([
        { key: "defaultTheme", value: "dark" },
        { key: "defaultLocale", value: "de" },
        { key: "defaultToolView", value: "fullscreen" },
      ]);
      expect(store.upserted).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("preserves existing valid defaultTheme, defaultLocale, and defaultToolView rows", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      store.rows.set("defaultTheme", "system");
      store.rows.set("defaultLocale", "fr");
      store.rows.set("defaultToolView", "fullscreen");

      await ensureDefaultSettings();

      expect(store.inserted).toEqual([]);
      expect(store.upserted).toEqual([]);
      expect(store.rows.get("defaultTheme")).toBe("system");
      expect(store.rows.get("defaultLocale")).toBe("fr");
      expect(store.rows.get("defaultToolView")).toBe("fullscreen");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it.each([
    ["defaultLocale", "de_DE", "en"],
    ["defaultLocale", "french", "fr"],
    ["defaultLocale", "", "en"],
    ["defaultTheme", "solarized", "light"],
    ["defaultTheme", "", "dark"],
    ["defaultToolView", "grid", "sidebar"],
    ["defaultToolView", "", "fullscreen"],
  ])(
    "repairs an existing %s row holding invalid value %j to env default %j and logs a warning",
    async (key, invalidValue, envDefault) => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      try {
        store.rows.set("defaultTheme", "light");
        store.rows.set("defaultLocale", "en");
        store.rows.set("defaultToolView", "sidebar");
        store.rows.set(key, invalidValue);

        if (key === "defaultLocale") env.DEFAULT_LOCALE = envDefault;
        if (key === "defaultTheme") env.DEFAULT_THEME = envDefault as "light" | "dark" | "system";
        if (key === "defaultToolView")
          env.DEFAULT_TOOL_VIEW = envDefault as "sidebar" | "fullscreen";

        await ensureDefaultSettings();

        expect(store.upserted).toEqual([{ key, value: envDefault }]);
        expect(store.rows.get(key)).toBe(envDefault);
        expect(warnSpy).toHaveBeenCalledWith(
          { key, value: invalidValue, replacement: envDefault },
          "invalid default setting, resetting to env default",
        );
      } finally {
        warnSpy.mockRestore();
      }
    },
  );

  it("is imported from settings-helpers and called at API startup in apps/api/src/index.ts", () => {
    const source = readFileSync(new URL("../../../apps/api/src/index.ts", import.meta.url), "utf8");
    expect(source).toMatch(
      /import\s*\{[^}]*\bensureDefaultSettings\b[^}]*\}\s*from\s*"\.\/lib\/settings-helpers\.js"/,
    );
    expect(source).toContain("await ensureDefaultSettings();");
    expect(source).not.toContain("async function ensureDefaultSettings");
  });
});
