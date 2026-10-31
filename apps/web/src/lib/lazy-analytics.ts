import { quietImport } from "@/lib/chunk-reload";

type Analytics = typeof import("@/lib/analytics");

/**
 * Runs a fire-and-forget analytics call once the SDK chunk has loaded. A chunk
 * that is gone after a deploy skips the call instead of reloading the page
 * under the user's files (#4141); telemetry is never worth that.
 */
export function withAnalytics(use: (analytics: Analytics) => void): void {
  void quietImport(() => import("@/lib/analytics")).then(use, () => {});
}
