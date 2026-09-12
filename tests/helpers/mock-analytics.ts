import { vi } from "vitest";

/**
 * The `@/lib/analytics` module shape for web unit tests.
 *
 * `getDistinctId` matters as much as `track`. `formatHeaders()` in `@/lib/api`
 * calls it, so a mock that leaves it out makes every request helper throw, and
 * any component with a bare catch turns that into an unrelated error state.
 * The symptom reads like a bug in whatever you were actually testing. Plenty of
 * older test files still hand-roll their own mock; new ones should use this.
 *
 * A `vi.mock` factory is hoisted above the file's imports, so reach it through
 * a dynamic import:
 *
 * ```ts
 * vi.mock("@/lib/analytics", async () => {
 *   const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
 *   return analyticsModuleMock();
 * });
 * ```
 *
 * Every export is a fresh `vi.fn()` per call, so a test that wants to assert on
 * one imports it from `@/lib/analytics` and wraps it in `vi.mocked()`.
 */
export function analyticsModuleMock() {
  return {
    track: vi.fn(),
    getDistinctId: vi.fn(() => null),
    captureHandledError: vi.fn(async () => {}),
    setSentryTag: vi.fn(),
    isAnalyticsActive: vi.fn(() => false),
    initAnalytics: vi.fn(async () => {}),
    optOut: vi.fn(),
    optIn: vi.fn(),
  };
}
