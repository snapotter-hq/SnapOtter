import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutation-focused coverage for analytics-gate.ts. The sibling
// analytics-gate.test.ts covers the env kill switches and the fail-closed
// anchor against the REAL module. This file mocks the seams the real one leaves
// untouched so the survived/no-cov branches die:
//   - ANALYTICS_BAKED forced ON, so the baked-off override (L47) and the cached
//     toggle value (L58/L67/L73) become observable instead of masked by the
//     committed bake=false.
//   - the db/index.js + drizzle-orm dynamic imports, to drive defaultReader
//     (L24-L25) with real rows.
//   - the jobs/types.js + jobs/connection.js dynamic imports, to drive the Redis
//     gate listener (L105, L114-L116, L128) without a live Redis.

// --- hoisted mock state -----------------------------------------------------

const bakedConfig = vi.hoisted(() => ({
  enabled: true, // forced ON so the toggle/override paths are observable
  posthogApiKey: "",
  posthogHost: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1.0,
}));

// db/index.js seam: `rows` is what the mocked query resolves to.
const dbState = vi.hoisted(() => ({ rows: [] as Array<{ value: string }> }));

// jobs/connection.js seam: a fake ioredis subscriber that records calls.
const redisState = vi.hoisted(() => ({
  subscriberSubscribe: vi.fn().mockResolvedValue(undefined),
  subscriberOn: vi.fn(),
  subscriberQuit: vi.fn().mockResolvedValue(undefined),
  sharedPublish: vi.fn().mockResolvedValue(1),
  messageHandler: null as null | (() => void),
  createdSubscribers: 0,
}));

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, ANALYTICS_BAKED: bakedConfig };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(dbState.rows),
        }),
      }),
    }),
  },
  schema: { settings: { key: "key", value: "value" } },
}));

vi.mock("drizzle-orm", () => ({ eq: () => "mocked-eq" }));

vi.mock("../../../apps/api/src/jobs/types.js", () => ({
  bullPrefix: () => "test_prefix",
}));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  createRedisSubscriberConnection: () => {
    redisState.createdSubscribers += 1;
    return {
      on: (event: string, handler: () => void) => {
        redisState.subscriberOn(event, handler);
        if (event === "message") redisState.messageHandler = handler;
      },
      subscribe: redisState.subscriberSubscribe,
      quit: redisState.subscriberQuit,
    };
  },
  sharedRedis: () => ({ publish: redisState.sharedPublish }),
}));

type GateModule = typeof import("../../../apps/api/src/lib/analytics-gate.js");
let gate: GateModule;

const origEnv = process.env.NODE_ENV;
const origTelemetry = process.env.SNAPOTTER_TELEMETRY;
const origAnalyticsEnabled = process.env.ANALYTICS_ENABLED;
const origOverride = process.env.ANALYTICS_BAKED_OVERRIDE;

beforeEach(async () => {
  bakedConfig.enabled = true;
  dbState.rows = [];
  redisState.subscriberSubscribe.mockClear();
  redisState.subscriberOn.mockClear();
  redisState.subscriberQuit.mockClear();
  redisState.sharedPublish.mockClear();
  redisState.messageHandler = null;
  redisState.createdSubscribers = 0;

  process.env.NODE_ENV = "test";
  delete process.env.SNAPOTTER_TELEMETRY;
  delete process.env.ANALYTICS_ENABLED;
  delete process.env.ANALYTICS_BAKED_OVERRIDE;

  vi.resetModules();
  gate = await import("../../../apps/api/src/lib/analytics-gate.js");
  gate.__resetGateForTests();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.NODE_ENV = origEnv;
  if (origTelemetry === undefined) delete process.env.SNAPOTTER_TELEMETRY;
  else process.env.SNAPOTTER_TELEMETRY = origTelemetry;
  if (origAnalyticsEnabled === undefined) delete process.env.ANALYTICS_ENABLED;
  else process.env.ANALYTICS_ENABLED = origAnalyticsEnabled;
  if (origOverride === undefined) delete process.env.ANALYTICS_BAKED_OVERRIDE;
  else process.env.ANALYTICS_BAKED_OVERRIDE = origOverride;
});

// --- bakedEnabled override, observable because baked is mocked ON -----------

describe("bakedEnabled baked-off override (L47)", () => {
  it("override=off flips a baked-ON default to disabled", () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    expect(gate.bakedEnabled()).toBe(false);
  });

  it("no override keeps the baked-ON default enabled", () => {
    expect(gate.bakedEnabled()).toBe(true);
  });

  it("override=on keeps it enabled (L46)", () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    expect(gate.bakedEnabled()).toBe(true);
  });

  it("ignores the override under NODE_ENV=production and returns the mocked bake", () => {
    process.env.NODE_ENV = "production";
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    // Production ignores the override, so the mocked bake (true) wins.
    expect(gate.bakedEnabled()).toBe(true);
  });
});

// --- effective gate value, cache toggle (L54/L58/L65/L67/L73) ---------------

describe("analyticsEnabled reflects the cached toggle", () => {
  it("serves ON when the reader reports enabled", async () => {
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("serves OFF when the reader reports disabled", async () => {
    gate.__setReaderForTests(async () => false);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(false);
  });

  it("treats an absent toggle (undefined) as ON (L65)", async () => {
    gate.__setReaderForTests(async () => undefined);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("returns false immediately when baked is off, ignoring the cache (L54)", async () => {
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();
    bakedConfig.enabled = false;
    expect(gate.analyticsEnabled()).toBe(false);
  });
});

// --- fail-closed anchor: knownDisabled = !on (L67) and its use (L73) --------

describe("fail-closed anchor pins knownDisabled = !on", () => {
  it("does NOT force disabled after an enabled read then a read error", async () => {
    // If L67 were `knownDisabled = on`, an enabled read would arm the anchor and
    // this error path would wrongly flip the cache to false.
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);

    gate.__setReaderForTests(async () => {
      throw new Error("db down");
    });
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("keeps serving disabled after a disabled read then a read error (L73)", async () => {
    gate.__setReaderForTests(async () => false);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(false);

    gate.__setReaderForTests(async () => {
      throw new Error("db down");
    });
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(false);
  });

  it("keeps the last enabled value across an error when disabled was never seen", async () => {
    gate.__setReaderForTests(async () => undefined); // -> ON, knownDisabled stays false
    await gate.refreshAnalyticsGate();
    gate.__setReaderForTests(async () => {
      throw new Error("db down");
    });
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });
});

// --- TTL staleness boundary (L55) -------------------------------------------

describe("analyticsEnabled TTL refresh boundary (L55)", () => {
  const TTL_MS = 30_000;

  it("does NOT background-refresh while the cache is fresh", async () => {
    vi.useFakeTimers();
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate(); // fetchedAt = now
    expect(gate.analyticsEnabled()).toBe(true);

    // Swap in a disabled reader but stay inside the TTL window: no refresh fires,
    // so the cached ON value is still served.
    gate.__setReaderForTests(async () => false);
    vi.advanceTimersByTime(TTL_MS - 1);
    expect(gate.analyticsEnabled()).toBe(true);
    await vi.runAllTimersAsync();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("does NOT refresh at exactly TTL_MS (strict > boundary)", async () => {
    vi.useFakeTimers();
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();

    gate.__setReaderForTests(async () => false);
    vi.advanceTimersByTime(TTL_MS); // delta === TTL_MS, `> TTL_MS` is false
    // Reading serves cache; no background refresh is scheduled at the boundary.
    expect(gate.analyticsEnabled()).toBe(true);
    await vi.runAllTimersAsync();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("background-refreshes once the cache is older than TTL_MS", async () => {
    vi.useFakeTimers();
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();

    gate.__setReaderForTests(async () => false);
    vi.advanceTimersByTime(TTL_MS + 1); // delta > TTL_MS -> schedule refresh
    // The synchronous read still serves the stale cached value...
    expect(gate.analyticsEnabled()).toBe(true);
    // ...then the background refresh lands and flips it to disabled.
    await vi.runAllTimersAsync();
    expect(gate.analyticsEnabled()).toBe(false);
  });
});

// --- primed flag: L68 set, L88 read, L96-L97 reset --------------------------

describe("gatePrimed lifecycle (L68, L88, L96-L97)", () => {
  it("is false before any read and true after a successful read", async () => {
    expect(gate.gatePrimed()).toBe(false);
    gate.__setReaderForTests(async () => true);
    await gate.refreshAnalyticsGate();
    expect(gate.gatePrimed()).toBe(true);
  });

  it("becomes primed even when the read reports disabled", async () => {
    gate.__setReaderForTests(async () => false);
    await gate.refreshAnalyticsGate();
    expect(gate.gatePrimed()).toBe(true);
  });

  it("stays UNprimed when the very first read throws", async () => {
    gate.__setReaderForTests(async () => {
      throw new Error("db down at boot");
    });
    await gate.refreshAnalyticsGate();
    expect(gate.gatePrimed()).toBe(false);
  });

  it("__resetGateForTests clears primed and restores the ON default", async () => {
    gate.__setReaderForTests(async () => false);
    await gate.refreshAnalyticsGate();
    expect(gate.gatePrimed()).toBe(true);
    expect(gate.analyticsEnabled()).toBe(false);

    gate.__resetGateForTests();
    expect(gate.gatePrimed()).toBe(false);
    expect(gate.analyticsEnabled()).toBe(true); // cachedEnabled back to ON default
  });
});

// --- primeAnalyticsGate wraps refresh (L79) ---------------------------------

describe("primeAnalyticsGate (L79)", () => {
  it("performs the initial read and primes the cache", async () => {
    gate.__setReaderForTests(async () => false);
    await gate.primeAnalyticsGate();
    expect(gate.gatePrimed()).toBe(true);
    expect(gate.analyticsEnabled()).toBe(false);
  });
});

// --- defaultReader over the mocked db (L24-L25) -----------------------------

describe("defaultReader reads the settings row (L24-L25)", () => {
  it("returns undefined when the settings row is absent (L24)", async () => {
    dbState.rows = [];
    gate.__setReaderForTests(null); // use the real defaultReader against mocked db
    await gate.refreshAnalyticsGate();
    // undefined -> default ON.
    expect(gate.analyticsEnabled()).toBe(true);
    expect(gate.gatePrimed()).toBe(true);
  });

  it("returns false when the stored value is 'false' (L25)", async () => {
    dbState.rows = [{ value: "false" }];
    gate.__setReaderForTests(null);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(false);
  });

  it("returns true when the stored value is anything other than 'false' (L25)", async () => {
    dbState.rows = [{ value: "true" }];
    gate.__setReaderForTests(null);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });

  it("treats an empty-string stored value as enabled (only 'false' disables)", async () => {
    dbState.rows = [{ value: "" }];
    gate.__setReaderForTests(null);
    await gate.refreshAnalyticsGate();
    expect(gate.analyticsEnabled()).toBe(true);
  });
});

// --- Redis gate listener (L105, L114-L116, L128) ----------------------------

describe("Redis gate listener wiring", () => {
  it("subscribes to <prefix>:analytics-gate and refreshes on a message", async () => {
    await gate.startAnalyticsGateListener();

    expect(redisState.createdSubscribers).toBe(1);
    // L105/L115: channel name is `${bullPrefix()}:analytics-gate`.
    expect(redisState.subscriberSubscribe).toHaveBeenCalledWith("test_prefix:analytics-gate");
    // L114: an error handler is registered.
    expect(redisState.subscriberOn).toHaveBeenCalledWith("error", expect.any(Function));
    // L116: a message handler is registered.
    expect(redisState.subscriberOn).toHaveBeenCalledWith("message", expect.any(Function));

    // Firing the message handler triggers a gate refresh (disabled reader).
    gate.__setReaderForTests(async () => false);
    expect(redisState.messageHandler).toBeTypeOf("function");
    redisState.messageHandler?.();
    await vi.waitFor(() => expect(gate.analyticsEnabled()).toBe(false));
  });

  it("publishes the invalidation on the same channel", async () => {
    await gate.publishAnalyticsGateInvalidation();
    expect(redisState.sharedPublish).toHaveBeenCalledWith("test_prefix:analytics-gate", "1");
  });

  it("stopAnalyticsGateListener quits the subscriber and is idempotent (L128)", async () => {
    await gate.startAnalyticsGateListener();
    await gate.stopAnalyticsGateListener();
    expect(redisState.subscriberQuit).toHaveBeenCalledTimes(1);

    // Second stop is a no-op: the guard means quit is not called again.
    await gate.stopAnalyticsGateListener();
    expect(redisState.subscriberQuit).toHaveBeenCalledTimes(1);
  });

  it("stopAnalyticsGateListener with no active subscriber does nothing", async () => {
    await gate.stopAnalyticsGateListener();
    expect(redisState.subscriberQuit).not.toHaveBeenCalled();
  });
});
