import { useEffect, useRef } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { runEndWrites } from "@/lib/run-teardown";
import { useFileStore } from "@/stores/file-store";

/**
 * Ends a run the panel's unmount cuts off.
 *
 * The panels that send their own request abort it when they unmount, and an abort
 * fires neither `onload` nor `onerror`, so nothing cleared the file store's
 * `processing` flag. A panel that remounts (the window crossing the breakpoint
 * swaps the whole tool page) then showed a run that could never end (#2304), and
 * with the page turning dropped files away mid-run (#2108) it would refuse them
 * all.
 *
 * `isInFlight` says whether this panel's request is still out; `stop` aborts it.
 * A finished run is left alone, outcome and all. Both are read at unmount time
 * through a ref, so the effect never re-runs and never cuts a run short itself.
 */
export function useSettleOnUnmount(isInFlight: () => boolean, stop: () => void): void {
  const message = useTranslation().t.errors.runInterrupted;
  const latest = useRef({ isInFlight, stop, message });
  useEffect(() => {
    latest.current = { isInFlight, stop, message };
  });
  useEffect(
    () => () => {
      const { isInFlight: inFlight, stop: abort, message: interrupted } = latest.current;
      if (!inFlight()) return;
      abort();
      // A store the user already cleared has nothing left to settle, and a message
      // written now would land on whatever they do next.
      const store = useFileStore.getState();
      if (!store.processing) return;
      // Each write on its own: a store subscriber that throws must not skip the
      // message, and out of an effect cleanup it would reach the error boundary.
      const teardownError = runEndWrites([
        () => store.setProcessing(false),
        () => store.setError(interrupted),
      ]);
      if (teardownError) {
        reportRunEndFailure(
          "Ending a tool run after its panel unmounted failed",
          teardownError.cause,
        );
      }
    },
    [],
  );
}
