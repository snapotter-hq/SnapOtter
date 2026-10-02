import { SafeError } from "@snapotter/shared";
import { Loader2, Upload, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { type CancelRefusalReason, CancelRefusedError } from "@/lib/cancel-refusal";
import { useFileStore } from "@/stores/file-store";

interface ProgressCardProps {
  active: boolean;
  phase: "uploading" | "processing" | "complete";
  label: string;
  stage?: string;
  percent: number;
  elapsed: number;
}

export function ProgressCard({ active, phase, label, stage, percent, elapsed }: ProgressCardProps) {
  const { t } = useTranslation();
  const activeJobId = useFileStore((s) => s.activeJobId);
  const cancelCurrentJob = useFileStore((s) => s.cancelCurrentJob);
  const [canceling, setCanceling] = useState(false);
  // The last refused cancel, tied to the run it was for so a new run starts
  // with a clean card (#1815).
  const [refusal, setRefusal] = useState<{ jobId: string; reason: CancelRefusalReason } | null>(
    null,
  );

  if (!active) return null;

  const icon =
    phase === "uploading" ? (
      <Upload className="h-4 w-4 text-primary" />
    ) : (
      <Loader2 className="h-4 w-4 text-primary animate-spin" />
    );

  const sublabel = [stage, `${elapsed}s`].filter(Boolean).join(" · ");

  const refusalMessages: Record<CancelRefusalReason, string> = {
    notCancellable: t.tools.processing.cancelUnavailable,
    notAllowed: t.tools.processing.cancelNotAllowed,
    failed: t.tools.processing.cancelFailed,
  };
  const refusalMessage =
    refusal && refusal.jobId === activeJobId ? refusalMessages[refusal.reason] : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-muted/80 border border-border rounded-xl p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sublabel}</div>
        </div>
        <span className="text-sm font-semibold text-primary-ink font-mono tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {activeJobId && cancelCurrentJob && (
        <button
          type="button"
          disabled={canceling}
          onClick={async () => {
            setCanceling(true);
            setRefusal(null);
            try {
              await cancelCurrentJob();
            } catch (cause) {
              // The server said no, or never answered: the run goes on, and
              // the user hears why. The hook already logged it and, for a
              // fault, reported it (#1815).
              if (cause instanceof CancelRefusedError) {
                setRefusal({ jobId: activeJobId, reason: cause.reason });
                return;
              }
              // Anything else is the hook's own teardown breaking (#1779).
              // Report it rather than leave an unhandled rejection; the
              // finally still re-enables the button.
              console.error("Canceling the run failed", cause);
              void captureHandledError(
                new SafeError("Canceling the run failed", { kind: "bug", cause }),
                { error_class: "bug" },
              );
            } finally {
              setCanceling(false);
            }
          }}
          className="w-full py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-3 w-3" />
          {t.common.cancel}
        </button>
      )}
      {refusalMessage && <p className="text-xs text-destructive-ink">{refusalMessage}</p>}
    </div>
  );
}
