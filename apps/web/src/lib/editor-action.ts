import { SafeError } from "@snapotter/shared";
import { toast } from "sonner";
import { captureHandledError } from "@/lib/analytics";

/**
 * Fire an editor store action that rebuilds the source bitmap (rotate, flip, crop).
 * It rejects when the bitmap can't be built, with the editor left as it was, so the
 * failure has to reach the user as a toast and not as an unhandled rejection (#2070).
 */
export function runEditorAction(action: Promise<void>, failureMessage: string): void {
  action.catch((err: unknown) => {
    // Handling the rejection takes it out of Sentry's global handler, and a toast
    // alone leaves nothing to debug from (which of the five ways the bitmap can
    // fail?), so log it and report it too.
    console.error("Editor action failed", err);
    void captureHandledError(
      new SafeError("Editor could not rebuild the source image", {
        kind: "operational",
        cause: err,
      }),
      { error_class: "operational" },
    );
    toast.error(failureMessage);
  });
}
