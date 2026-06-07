// apps/web/src/components/editor/common/loading-overlay.tsx
import { X } from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

export function LoadingOverlay() {
  const { t } = useTranslation();
  const loadingState = useEditorStore((s) => s.loadingState);
  const setLoadingState = useEditorStore((s) => s.setLoadingState);

  if (!loadingState) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-lg min-w-[200px]">
        {/* Operation name */}
        <p className="text-sm font-medium text-foreground">{loadingState.operation}</p>

        {/* Progress bar */}
        {loadingState.progress !== null && (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-all duration-200",
                loadingState.progress < 0 && "animate-pulse w-full",
              )}
              style={
                loadingState.progress >= 0
                  ? { width: `${Math.min(100, loadingState.progress)}%` }
                  : undefined
              }
            />
          </div>
        )}

        {/* Indeterminate spinner when no progress */}
        {loadingState.progress === null && (
          <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
        )}

        {/* Cancel button */}
        {loadingState.cancellable && (
          <button
            type="button"
            onClick={() => setLoadingState(null)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
            aria-label={t.a11y.cancelOperation}
          >
            <X size={12} />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
