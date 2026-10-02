import { SafeError } from "@snapotter/shared";
import { captureHandledError } from "@/lib/analytics";

/**
 * Where a run's end broke, one constant message per site so each groups on
 * its own in Sentry. Nothing variable goes in: the entry's name, error text
 * and URLs stay in the browser.
 */
export type RunEndFailure =
  | "Failing a tool run's entries failed"
  | "Failing a sync tool run's entry failed"
  | "Failing a batch run's entries failed"
  | "Failing a pipeline run's entries failed"
  | "Ending a sync tool run after a result handling error failed"
  | "Ending a pipeline run after a result handling error failed"
  | "Ending a tool run after its start failed"
  | "Ending a pipeline run after its start failed"
  | "Ending an Erase Object batch after a store error failed"
  | "Ending a Collage run after a result handling error failed"
  | "Ending a Sign PDF run after a result handling error failed"
  | "Ending an Erase Object run after a result handling error failed";

/**
 * Reports a store write that threw while a run was ending (#1812). Those
 * catches log and carry on so the run still ends, but Sentry has no console
 * integration, so a log alone never reaches it. Call it once per failed
 * settle, not once per entry. The cause rides along, and the scrubber sends
 * its message only through the shared redactor, with file names, paths and
 * URLs masked. Never throws and never waits, so the settles that call it stay
 * synchronous.
 */
export function reportRunEndFailure(message: RunEndFailure, cause: unknown, toolId?: string): void {
  void captureHandledError(
    new SafeError(message, { kind: "bug", cause }),
    toolId ? { error_class: "bug", tool_id: toolId } : { error_class: "bug" },
  );
}
