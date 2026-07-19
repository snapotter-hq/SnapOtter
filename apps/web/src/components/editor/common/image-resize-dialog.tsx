import { Lock, Unlock, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

export function ImageResizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const resizeImage = useEditorStore((s) => s.resizeImage);

  const [width, setWidth] = useState(canvasSize.width);
  const [height, setHeight] = useState(canvasSize.height);
  const [lockAspect, setLockAspect] = useState(true);

  const aspectRatio = canvasSize.width / canvasSize.height;

  // Sync when dialog opens
  useEffect(() => {
    if (open) {
      setWidth(canvasSize.width);
      setHeight(canvasSize.height);
    }
  }, [open, canvasSize]);

  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const w = Math.max(1, Number(e.target.value) || 1);
      setWidth(w);
      if (lockAspect) {
        setHeight(Math.round(w / aspectRatio));
      }
    },
    [lockAspect, aspectRatio],
  );

  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = Math.max(1, Number(e.target.value) || 1);
      setHeight(h);
      if (lockAspect) {
        setWidth(Math.round(h * aspectRatio));
      }
    },
    [lockAspect, aspectRatio],
  );

  const handleApply = useCallback(() => {
    resizeImage(width, height);
    onClose();
  }, [width, height, resizeImage, onClose]);

  const pctWidth = canvasSize.width > 0 ? ((width / canvasSize.width) * 100).toFixed(1) : "100.0";
  const pctHeight =
    canvasSize.height > 0 ? ((height / canvasSize.height) * 100).toFixed(1) : "100.0";

  if (!open) return null;

  const inputCn = cn(
    "h-8 w-full rounded border border-border bg-card px-2 text-sm text-foreground",
    "focus:border-ring focus:outline-none",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[380px] rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Image Size</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          {/* Current size info */}
          <p className="text-xs text-muted-foreground">
            Original: {canvasSize.width} x {canvasSize.height} px
          </p>

          {/* Width / Lock / Height */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="img-w" className="mb-1 block text-xs text-muted-foreground">
                Width (px)
              </label>
              <input
                id="img-w"
                type="number"
                min={1}
                max={16384}
                value={width}
                onChange={handleWidthChange}
                className={inputCn}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">{pctWidth}%</p>
            </div>

            <button
              type="button"
              onClick={() => setLockAspect(!lockAspect)}
              title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              aria-label={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              aria-pressed={lockAspect}
              className={cn(
                "mb-4 flex h-8 w-8 items-center justify-center rounded transition-colors",
                lockAspect
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {lockAspect ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>

            <div className="flex-1">
              <label htmlFor="img-h" className="mb-1 block text-xs text-muted-foreground">
                Height (px)
              </label>
              <input
                id="img-h"
                type="number"
                min={1}
                max={16384}
                value={height}
                onChange={handleHeightChange}
                className={inputCn}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">{pctHeight}%</p>
            </div>
          </div>

          {/* Info note */}
          <p className="text-[10px] text-muted-foreground">
            Scales all objects proportionally to the new dimensions.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "h-8 rounded border border-border px-3 text-sm",
              "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={cn(
              "h-8 rounded bg-primary px-3 text-sm text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
