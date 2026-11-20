import { ANALYTICS_BAKED } from "@snapotter/shared";
import type Redis from "ioredis";
import { ANALYTICS_CONSENT_ORIGIN_KEY } from "./analytics-consent.js";

const TTL_MS = 30_000;
const SETTING_KEY = "analyticsEnabled";

// The reader answers the admin's effective decision: true or false, or
// `undefined` while nobody has decided (#4910). Undecided sends nothing.
type GateReader = () => Promise<boolean | undefined>;

let cachedEnabled = true; // last known toggle value; only Sentry reads it before priming, and Sentry waits for gatePrimed()
let cachedDecided = true; // false while a fresh install waits for the admin's answer
let knownDisabled = false; // have we positively read "disabled"? fail-closed anchor
let primed = false; // has a successful read happened yet? gates Sentry at cold start
let fetchedAt = 0; // Date.now() of the last read attempt
let reader: GateReader = defaultReader;

/**
 * A stored analyticsEnabled row is the decision. Without one, an instance that
 * predates the consent prompt keeps the old default (on), and everything else,
 * a fresh install or one not yet classified, counts as undecided.
 */
export function resolveAnalyticsDecision(
  stored: string | undefined,
  origin: string | undefined,
): boolean | undefined {
  if (stored !== undefined) return stored !== "false";
  if (origin === "upgrade") return true;
  return undefined;
}

async function defaultReader(): Promise<boolean | undefined> {
  const { db, schema } = await import("../db/index.js");
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ key: schema.settings.key, value: schema.settings.value })
    .from(schema.settings)
    .where(inArray(schema.settings.key, [SETTING_KEY, ANALYTICS_CONSENT_ORIGIN_KEY]))
    .limit(2);
  const stored = rows.find((row) => row.key === SETTING_KEY)?.value;
  const origin = rows.find((row) => row.key === ANALYTICS_CONSENT_ORIGIN_KEY)?.value;
  return resolveAnalyticsDecision(stored, origin);
}

/**
 * Runtime kill switch honored in ALL builds: SNAPOTTER_TELEMETRY=0|false|off.
 *
 * ANALYTICS_ENABLED=false|0|off is honored as an alias. It is the opt-out
 * variable historically documented on the Docker Hub README but never wired in
 * 2.x, so a user who set it was still tracked. Treating it as a kill signal
 * makes that documented opt-out genuinely stop egress.
 */
export function telemetryEnvKilled(): boolean {
  const off = (v: string | undefined) => v === "0" || v === "false" || v === "off";
  return off(process.env.SNAPOTTER_TELEMETRY) || off(process.env.ANALYTICS_ENABLED);
}

/** Opt-in diagnostic verbosity for a single (usually self-hosted) instance. */
export function sentryDiagnostic(): boolean {
  const v = process.env.SNAPOTTER_SENTRY_DIAGNOSTIC;
  return v === "1" || v === "true" || v === "on";
}

/** Compile-time bake, with a NON-PRODUCTION-only override so tests can force it on. */
export function bakedEnabled(): boolean {
  if (telemetryEnvKilled()) return false;
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

/**
 * True while a fresh install waits for the admin to answer the first-run
 * prompt. Nothing is sent in that state. False when analytics can never come
 * on (bake off or an env kill switch), since there is nothing to ask.
 */
export function analyticsConsentPending(): boolean {
  if (!bakedEnabled()) return false;
  return !cachedDecided;
}

const disabledListeners = new Set<() => void>();

/**
 * Runs once each time the toggle moves from on to off. Events already queued in
 * the telemetry client must be dropped here, because the client flushes queued
 * events without re-checking the opt-out (#4269).
 */
export function onAnalyticsDisabled(listener: () => void): () => void {
  disabledListeners.add(listener);
  return () => disabledListeners.delete(listener);
}

/**
 * Read the toggle into the cache, failing closed on a read error. Resolves to
 * the failure when this read threw, otherwise null. The error sits inside an
 * object so a reader that throws undefined still counts as a failure.
 */
async function readIntoCache(): Promise<{ error: unknown } | null> {
  try {
    const v = await reader();
    const on = v === true;
    const becameDisabled = !on && !knownDisabled;
    cachedEnabled = on;
    cachedDecided = v !== undefined;
    knownDisabled = !on;
    primed = true;
    fetchedAt = Date.now();
    if (becameDisabled) {
      for (const listener of disabledListeners) {
        try {
          listener();
        } catch {
          // A failing listener must not break the gate; the cache is already updated.
        }
      }
    }
    return null;
  } catch (error) {
    // DB read failed. If we ever positively saw "disabled", keep serving disabled
    // rather than reverting to the ON default. Otherwise keep the last value.
    if (knownDisabled) cachedEnabled = false;
    fetchedAt = Date.now(); // do not hammer the DB on repeated errors
    return { error };
  }
}

/** Read the toggle and update the cache. Fails closed on read error. */
export async function refreshAnalyticsGate(): Promise<void> {
  await readIntoCache();
}

/**
 * Warm the cache at boot before traffic is served. Rejects when this read
 * fails while the bake allows analytics, which stops the boot: the cache would
 * otherwise keep its default-on guess, and instance_started, GET
 * /api/v1/config/analytics and the PostHog proxy would all act on it for an
 * instance that opted out. With the bake off analytics can never come on, so
 * a failed read doesn't stop the boot. Sentry already waits for a successful
 * read (instrument.ts).
 */
export async function primeAnalyticsGate(): Promise<void> {
  const failure = await readIntoCache();
  if (failure && bakedEnabled()) {
    throw new Error(
      "Could not read the analyticsEnabled setting at startup, so analytics can't be confirmed off. Check the database connection.",
      { cause: failure.error },
    );
  }
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
  cachedDecided = true;
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
  const { createRedisSubscriberConnection } = await import("../jobs/connection.js");
  // createRedisSubscriberConnection already logs connection errors under this
  // name; a listener here would log every reconnect attempt twice.
  gateSubscriber = createRedisSubscriberConnection("analytics-gate");
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
