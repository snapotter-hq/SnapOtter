import { useCallback } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { showIntakeIgnored } from "@/lib/intake-notice";

/**
 * Whether files dropped, pasted or added onto a tool page may be taken now.
 *
 * On a tool that holds one file, intake replaces it, and a run in flight either
 * watches the file store and stops once its file is gone (#1894, #1975) or, for
 * the tools with a store of their own, finishes and lands its result under the new
 * file. A stray drop that does either, silently, is worse than a refused one, so
 * while a run is in flight this says so and turns the files away (#2108).
 *
 * "In flight" is the leave guard's own definition (`useWorkInFlight`), so the
 * file store's flag and the own-store tools' busy flags count alike, and the
 * message never contradicts the guard that stops the user leaving.
 */
export function useIntakeGuard(): { running: boolean; allowIntake: () => boolean } {
  const message = useTranslation().t.dropzone.ignoredWhileRunning;
  const running = useWorkInFlight()?.kind === "processing";
  const allowIntake = useCallback(() => {
    if (!running) return true;
    showIntakeIgnored(message);
    return false;
  }, [running, message]);
  return { running, allowIntake };
}
