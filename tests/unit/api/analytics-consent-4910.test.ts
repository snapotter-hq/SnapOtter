import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// First-run analytics consent (#4910). A fresh install sends nothing until an
// admin answers; an instance that predates the prompt keeps its old default.

const store = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  usersExist: false,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    eq: (_col: unknown, val: unknown) => ({ op: "eq", val }),
    inArray: (_col: unknown, vals: unknown) => ({ op: "in", vals }),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => {
  const select = () => ({
    from: () => ({
      where: (pred: { op: string; val?: string; vals?: string[] }) => {
        const keys = pred.op === "in" ? (pred.vals ?? []) : [pred.val as string];
        const result = keys
          .filter((key) => store.settings.has(key))
          .map((key) => ({ key, value: store.settings.get(key) as string }));
        return Object.assign(Promise.resolve(result), { limit: () => Promise.resolve(result) });
      },
    }),
  });
  return {
    db: {
      select,
      // classifyAnalyticsConsentOrigin's one raw query: did anything exist before it?
      execute: async () => {
        const otherSettings = [...store.settings.keys()].some(
          (key) => key !== "analyticsConsentOrigin",
        );
        return { rows: [{ existed: store.usersExist || otherSettings }] };
      },
      insert: () => ({
        values: (row: { key: string; value: string }) => ({
          onConflictDoNothing: async () => {
            if (!store.settings.has(row.key)) store.settings.set(row.key, row.value);
          },
          onConflictDoUpdate: async () => {
            store.settings.set(row.key, row.value);
          },
        }),
      }),
    },
    schema: { settings: { key: "settings.key", value: "settings.value" } },
  };
});

import { env } from "../../../apps/api/src/config.js";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsConsentPending,
  analyticsEnabled,
  refreshAnalyticsGate,
  resolveAnalyticsDecision,
} from "../../../apps/api/src/lib/analytics-gate.js";
import {
  classifyAnalyticsConsentOrigin,
  ensureDefaultSettings,
} from "../../../apps/api/src/lib/settings-helpers.js";
import { getSettingPolicy } from "../../../apps/api/src/lib/settings-policy.js";

const originalAnalyticsDefault = env.SNAPOTTER_ANALYTICS_DEFAULT;
const saved = {
  NODE_ENV: process.env.NODE_ENV,
  ANALYTICS_BAKED_OVERRIDE: process.env.ANALYTICS_BAKED_OVERRIDE,
  SNAPOTTER_TELEMETRY: process.env.SNAPOTTER_TELEMETRY,
  ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED,
};

beforeEach(() => {
  store.settings.clear();
  store.usersExist = false;
  env.SNAPOTTER_ANALYTICS_DEFAULT = undefined;
  process.env.NODE_ENV = "test";
  process.env.ANALYTICS_BAKED_OVERRIDE = "on";
  delete process.env.SNAPOTTER_TELEMETRY;
  delete process.env.ANALYTICS_ENABLED;
  __resetGateForTests();
});

afterEach(() => {
  env.SNAPOTTER_ANALYTICS_DEFAULT = originalAnalyticsDefault;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetGateForTests();
});

describe("resolveAnalyticsDecision", () => {
  it("uses a stored answer whatever the origin", () => {
    expect(resolveAnalyticsDecision("true", "fresh")).toBe(true);
    expect(resolveAnalyticsDecision("false", "upgrade")).toBe(false);
    expect(resolveAnalyticsDecision("false", undefined)).toBe(false);
  });

  it("keeps an upgraded instance on, as it was before the prompt existed", () => {
    expect(resolveAnalyticsDecision(undefined, "upgrade")).toBe(true);
  });

  it("leaves a fresh or unclassified instance undecided", () => {
    expect(resolveAnalyticsDecision(undefined, "fresh")).toBeUndefined();
    expect(resolveAnalyticsDecision(undefined, undefined)).toBeUndefined();
  });
});

describe("gate while undecided", () => {
  it("sends nothing and reports the prompt as pending", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
    expect(analyticsConsentPending()).toBe(true);
  });

  it("answering yes enables and clears the prompt", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    __setReaderForTests(async () => true);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(true);
    expect(analyticsConsentPending()).toBe(false);
  });

  it("answering no keeps it off and clears the prompt", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    __setReaderForTests(async () => false);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
    expect(analyticsConsentPending()).toBe(false);
  });

  it("does not ask when the bake or an env kill switch means nothing could be sent", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    process.env.SNAPOTTER_TELEMETRY = "0";
    expect(analyticsConsentPending()).toBe(false);
    delete process.env.SNAPOTTER_TELEMETRY;
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    expect(analyticsConsentPending()).toBe(false);
  });

  it("the env kill switch still beats a yes", async () => {
    __setReaderForTests(async () => true);
    await refreshAnalyticsGate();
    process.env.SNAPOTTER_TELEMETRY = "off";
    expect(analyticsEnabled()).toBe(false);
  });

  it("stays closed when a read fails while undecided", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    __setReaderForTests(async () => {
      throw new Error("db down");
    });
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
  });
});

describe("the real reader over settings rows", () => {
  it.each([
    [{}, false, true],
    [{ analyticsConsentOrigin: "fresh" }, false, true],
    [{ analyticsConsentOrigin: "upgrade" }, true, false],
    [{ analyticsConsentOrigin: "fresh", analyticsEnabled: "true" }, true, false],
    [{ analyticsConsentOrigin: "upgrade", analyticsEnabled: "false" }, false, false],
  ])("rows %j -> enabled %s, pending %s", async (rows, enabled, pending) => {
    for (const [key, value] of Object.entries(rows)) store.settings.set(key, value);
    __setReaderForTests(null);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(enabled);
    expect(analyticsConsentPending()).toBe(pending);
  });
});

describe("classifyAnalyticsConsentOrigin", () => {
  it("marks an empty database as fresh", async () => {
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("fresh");
    expect(store.settings.get("analyticsConsentOrigin")).toBe("fresh");
  });

  it("marks a database with users as an upgrade", async () => {
    store.usersExist = true;
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("upgrade");
    expect(store.settings.get("analyticsConsentOrigin")).toBe("upgrade");
  });

  it("marks a database with settings rows as an upgrade", async () => {
    store.settings.set("instance_id", "abc");
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("upgrade");
  });

  it("never reclassifies: a fresh install stays fresh after its first boot seeds rows", async () => {
    await classifyAnalyticsConsentOrigin();
    store.usersExist = true;
    store.settings.set("defaultTheme", "system");
    await expect(classifyAnalyticsConsentOrigin()).resolves.toBe("known");
    expect(store.settings.get("analyticsConsentOrigin")).toBe("fresh");
  });

  it("keeps an upgraded instance's stored opt-out as it was", async () => {
    store.settings.set("analyticsEnabled", "false");
    await classifyAnalyticsConsentOrigin();
    expect(store.settings.get("analyticsEnabled")).toBe("false");
    __setReaderForTests(null);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
    expect(analyticsConsentPending()).toBe(false);
  });

  it("is a read-only setting: not writable through the API or carried by a config export", () => {
    expect(getSettingPolicy("analyticsConsentOrigin")?.write).toBe("none");
  });
});

describe("SNAPOTTER_ANALYTICS_DEFAULT answers the prompt in advance", () => {
  it("unset seeds nothing, so a fresh install asks", async () => {
    await ensureDefaultSettings();
    expect(store.settings.has("analyticsEnabled")).toBe(false);
  });

  it("on seeds a yes", async () => {
    env.SNAPOTTER_ANALYTICS_DEFAULT = "on";
    await ensureDefaultSettings();
    expect(store.settings.get("analyticsEnabled")).toBe("true");
  });

  it("off seeds a no", async () => {
    env.SNAPOTTER_ANALYTICS_DEFAULT = "off";
    await ensureDefaultSettings();
    expect(store.settings.get("analyticsEnabled")).toBe("false");
  });

  it("never overrides an answer already stored", async () => {
    env.SNAPOTTER_ANALYTICS_DEFAULT = "on";
    store.settings.set("analyticsEnabled", "false");
    await ensureDefaultSettings();
    expect(store.settings.get("analyticsEnabled")).toBe("false");
  });
});

describe("boot order", () => {
  it("classifies after the 1.x import and before any other boot write or analytics", () => {
    const source = readFileSync(new URL("../../../apps/api/src/index.ts", import.meta.url), "utf8");
    const steps = [
      "await runBootImport(",
      "await classifyAnalyticsConsentOrigin();",
      "await ensureBuiltinRoles();",
      "await ensureDefaultSettings();",
      "await primeAnalyticsGate();",
      "await trackInstanceStarted();",
    ].map((step) => source.indexOf(step));
    expect(steps.every((at) => at > -1)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});
