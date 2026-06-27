import { ANALYTICS_BAKED } from "@snapotter/shared";
import type Redis from "ioredis";

const TTL_MS = 30_000;
const SETTING_KEY = "analyticsEnabled";

// `undefined` from a reader means the key is absent (default ON).
type GateReader = () => Promise<boolean | undefined>;

let cachedEnabled = true; // last known toggle value (default ON)
let knownDisabled = false; // have we positively read "disabled"? fail-closed anchor
let primed = false; // has a successful read happened yet? gates Sentry at cold start
let fetchedAt = 0; // Date.now() of the last read attempt
let reader: GateReader = defaultReader;

async function defaultReader(): Promise<boolean | undefined> {
  const { db, schema } = await import("../db/index.js");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTING_KEY))
    .limit(1);
  if (rows.length === 0) return undefined;
  return rows[0].value !== "false";
}

/** Compile-time bake, with a NON-PRODUCTION-only override so tests can force it on. */
export function bakedEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") {
    const o = process.env.ANALYTICS_BAKED_OVERRIDE;
    if (o === "on") return true;
    if (o === "off") return false;
  }
  return ANALYTICS_BAKED.enabled;
}

/** Synchronous effective gate. Safe to call from Sentry beforeSend. Never blocks. */
export function analyticsEnabled(): boolean {
  if (!bakedEnabled()) return false;
  if (Date.now() - fetchedAt > TTL_MS) {
    void refreshAnalyticsGate(); // background refresh; serve the cached value now
  }
  return cachedEnabled;
}

/** Read the toggle and update the cache. Fails closed on read error. */
export async function refreshAnalyticsGate(): Promise<void> {
  try {
    const v = await reader();
    const on = v === undefined ? true : v;
    cachedEnabled = on;
    knownDisabled = !on;
    primed = true;
    fetchedAt = Date.now();
  } catch {
    // DB read failed. If we ever positively saw "disabled", keep serving disabled
    // rather than reverting to the ON default. Otherwise keep the last value.
    if (knownDisabled) cachedEnabled = false;
    fetchedAt = Date.now(); // do not hammer the DB on repeated errors
  }
}

/** Warm the cache at boot before traffic is served. */
export async function primeAnalyticsGate(): Promise<void> {
  await refreshAnalyticsGate();
}

/**
 * True once a successful read has populated the cache. Backend Sentry inits at
 * process load (before the cache is primed), so its hooks check this to stay
 * silent during the boot window rather than emitting on the default-ON cache.
 */
export function gatePrimed(): boolean {
  return primed;
}

// Test seams (no-ops in production paths).
export function __setReaderForTests(r: GateReader | null): void {
  reader = r ?? defaultReader;
}
export function __resetGateForTests(): void {
  cachedEnabled = true;
  knownDisabled = false;
  primed = false;
  fetchedAt = 0;
  reader = defaultReader;
}

let gateSubscriber: Redis | null = null;
const CHANNEL = async () => {
  const { bullPrefix } = await import("../jobs/types.js");
  return `${bullPrefix()}:analytics-gate`;
};

/** Subscribe so a setting change on any replica refreshes this process's cache. */
export async function startAnalyticsGateListener(): Promise<void> {
  const { createRedisConnection } = await import("../jobs/connection.js");
  gateSubscriber = createRedisConnection();
  gateSubscriber.on("error", (err) => console.error("Analytics gate subscriber error", err));
  await gateSubscriber.subscribe(await CHANNEL());
  gateSubscriber.on("message", () => {
    void refreshAnalyticsGate();
  });
}

/** Publish so every replica drops its cache after a toggle write. */
export async function publishAnalyticsGateInvalidation(): Promise<void> {
  const { sharedRedis } = await import("../jobs/connection.js");
  await sharedRedis().publish(await CHANNEL(), "1");
}

export async function stopAnalyticsGateListener(): Promise<void> {
  if (gateSubscriber) {
    await gateSubscriber.quit();
    gateSubscriber = null;
  }
}
