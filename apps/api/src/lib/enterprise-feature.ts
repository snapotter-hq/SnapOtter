import type { EnterpriseFeature } from "@snapotter/enterprise";
import { type ReportContext, reportError } from "./error-report.js";

/**
 * Node raises one of these codes when a dynamically imported module genuinely is
 * not installed. Any other import failure means the module is present but failed
 * to load, which is a real fault, not the expected OSS "no enterprise" state.
 * Exported for direct unit testing: vitest wraps a throwing module mock in its
 * own error and strips the original code, so this branch cannot be driven with a
 * real ERR_MODULE_NOT_FOUND through the module mock.
 */
export function isModuleNotFound(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}

/**
 * Log and report a genuine enterprise-check failure. Two guards, because the
 * whole point of this helper is to degrade gracefully: reporting the degradation
 * must never itself throw.
 *
 * `reportError` runs first and is internally guarded. `logger` is imported lazily
 * (a static import would pull the file-transport logger, which builds pino
 * targets from env at load, into every gate consumer's module graph) and its use
 * is wrapped, so a logging fault can never turn a disabled feature into a throw.
 */
async function reportFeatureFailure(
  err: unknown,
  feature: EnterpriseFeature,
  source: ReportContext["source"],
  message: string,
): Promise<void> {
  void reportError(err, { source, subsystem: "enterprise-feature" });
  try {
    const { logger } = await import("./logger.js");
    logger.error({ err, feature }, message);
  } catch {
    // Best-effort local log; telemetry must never throw.
  }
}

/**
 * In-flight dynamic import of `@snapotter/enterprise`, deduplicated across
 * concurrent callers (snapotter-hq/SnapOtter#1000).
 *
 * Two concurrent `Promise.all([...])` requests that each reach the licence gate
 * would otherwise resolve the same dynamic import twice through vitest's mock
 * registry, and one of them could observe the un-mocked module (404 + real
 * `isFeatureEnabled`) while the other observes the mocked one. The gate then
 * denies the loser with 403, the SCIM "concurrent duplicate group creates"
 * test times out, and the suite flaks 1-in-2.
 *
 * Caching only the in-flight promise — not the resolved module — means:
 * - Concurrent callers in the same tick share one resolution (race fixed).
 * - Once the promise settles, the cache is cleared, so the next call
 *   re-imports fresh. That matters for `vi.resetModules()` between tests: a
 *   fresh `vi.doMock("@snapotter/enterprise", ...)` must apply on the next
 *   access, not return a stale snapshot from a previous test.
 * - In production the single-flight is a no-op (Node resolves the import in
 *   microseconds and the cache slot is already null before the next request),
 *   so there is no measurable cost.
 *
 * Scope: module-private. Other files do not see this; the only public surface
 * (`isEnterpriseFeatureEnabled`) is unchanged.
 */
let pendingEnterpriseImport: Promise<typeof import("@snapotter/enterprise")> | null = null;

function loadEnterpriseModule(): Promise<typeof import("@snapotter/enterprise")> {
  if (pendingEnterpriseImport) {
    return pendingEnterpriseImport;
  }
  const inflight = import("@snapotter/enterprise");
  pendingEnterpriseImport = inflight;
  // Clear the slot once settled so the NEXT call re-resolves fresh.
  // Attach on the same microtask chain as the caller's await; a finally
  // would also run on rejection, but that would rethrow to the
  // `pendingEnterpriseImport` reader below on the rejection path even when
  // nobody awaits it. Using then keeps the rejected value reachable only
  // through the caller's await.
  inflight.then(
    () => {
      pendingEnterpriseImport = null;
    },
    () => {
      pendingEnterpriseImport = null;
    },
  );
  return inflight;
}

/**
 * Whether an enterprise feature is licensed, resolved through the sanctioned
 * `@snapotter/enterprise` boundary (the same dynamic import every gate uses).
 *
 * Returns false when the enterprise package is absent (the OSS build) and stays
 * silent, because that is the expected state. Every other failure degrades to
 * false too, but is logged and reported first: a present-but-broken enterprise
 * module, or `isFeatureEnabled` throwing (it cannot today, but a future refactor
 * that adds IO could). Without that split, a licensed instance whose license
 * machinery faulted is indistinguishable from an unlicensed one and the gate
 * denies with no trace (snapotter-hq/SnapOtter#868).
 *
 * `source` only tags the Sentry report with where the check ran (a request is
 * "http", boot-time registration is "boot", a job is "worker"); it never changes
 * the result.
 */
export async function isEnterpriseFeatureEnabled(
  feature: EnterpriseFeature,
  source: ReportContext["source"] = "http",
): Promise<boolean> {
  let mod: typeof import("@snapotter/enterprise");
  try {
    mod = await loadEnterpriseModule();
  } catch (err) {
    if (!isModuleNotFound(err)) {
      await reportFeatureFailure(
        err,
        feature,
        source,
        "enterprise module failed to load; treating feature as disabled",
      );
    }
    return false;
  }
  try {
    return mod.isFeatureEnabled(feature);
  } catch (err) {
    await reportFeatureFailure(
      err,
      feature,
      source,
      "isFeatureEnabled threw; treating feature as disabled",
    );
    return false;
  }
}
