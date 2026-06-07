import { useDrag } from "@use-gesture/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFocusTrap } from "@/hooks/use-focus-trap";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "70dvh",
}: BottomSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, open);
  const [translateY, setTranslateY] = useState(0);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset translation when opened
  useEffect(() => {
    if (open) setTranslateY(0);
  }, [open]);

  const handleDismiss = useCallback(() => {
    setTranslateY(0);
    onClose();
  }, [onClose]);

  const bind = useDrag(
    ({ movement: [, my], last, cancel }) => {
      // Only allow downward dragging
      if (my < 0) {
        setTranslateY(0);
        return;
      }
      if (last) {
        if (my > 100) {
          handleDismiss();
        } else {
          setTranslateY(0);
        }
        return;
      }
      setTranslateY(my);
    },
    { axis: "y", filterTaps: true },
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "bottom-sheet-title" : undefined}
        className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-xl flex flex-col animate-in slide-in-from-bottom"
        style={{
          maxHeight,
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
          transition: translateY > 0 ? "none" : "transform 0.2s ease-out",
        }}
      >
        {/* Drag handle */}
        <div {...bind()} className="flex justify-center pt-2 pb-1 cursor-grab touch-none">
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-2 shrink-0">
            <h2 id="bottom-sheet-title" className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t.common.close}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">{children}</div>
      </div>
    </>
  );
}
