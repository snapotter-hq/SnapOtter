import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { AnchorPosition } from "@/types/editor";

// ---------------------------------------------------------------------------
// CanvasResizeDialog -- modal with W/H, 9-point anchor grid, fill color
// ---------------------------------------------------------------------------

const ANCHOR_POSITIONS: AnchorPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function CanvasResizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const resizeCanvas = useEditorStore((s) => s.resizeCanvas);

  const [width, setWidth] = useState(canvasSize.width);
  const [height, setHeight] = useState(canvasSize.height);
  const [anchor, setAnchor] = useState<AnchorPosition>("center");
  const [fill, setFill] = useState("#ffffff");

  useEffect(() => {
    if (open) {
      setWidth(canvasSize.width);
      setHeight(canvasSize.height);
    }
  }, [open, canvasSize]);

  const handleApply = useCallback(() => {
    resizeCanvas(width, height, anchor, fill);
    onClose();
  }, [width, height, anchor, fill, resizeCanvas, onClose]);

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
          <h2 className="text-sm font-medium text-foreground">Canvas Size</h2>
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
            Current: {canvasSize.width} x {canvasSize.height} px
          </p>

          {/* Width / Height */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="canvas-w" className="mb-1 block text-xs text-muted-foreground">
                Width (px)
              </label>
              <input
                id="canvas-w"
                type="number"
                min={1}
                max={16384}
                value={width}
                onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 1))}
                className={inputCn}
              />
            </div>
            <div>
              <label htmlFor="canvas-h" className="mb-1 block text-xs text-muted-foreground">
                Height (px)
              </label>
              <input
                id="canvas-h"
                type="number"
                min={1}
                max={16384}
                value={height}
                onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 1))}
                className={inputCn}
              />
            </div>
          </div>

          {/* Anchor grid */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Anchor:</p>
            <div className="inline-grid grid-cols-3 gap-1 rounded border border-border p-1.5">
              {ANCHOR_POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setAnchor(pos)}
                  title={pos.replace("-", " ")}
                  aria-label={`Anchor ${pos.replace("-", " ")}`}
                  aria-pressed={anchor === pos}
                  className={cn(
                    "h-5 w-5 rounded-sm transition-colors",
                    anchor === pos ? "bg-primary" : "bg-muted hover:bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          </div>

          {/* Background fill */}
          <div className="flex items-center gap-2">
            <label htmlFor="canvas-fill" className="text-xs text-muted-foreground">
              Background:
            </label>
            <input
              id="canvas-fill"
              type="color"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-border"
            />
            <input
              type="text"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              className={cn(
                "h-7 w-20 rounded border border-border bg-card px-1.5 text-xs text-foreground",
                "focus:border-ring focus:outline-none",
              )}
            />
          </div>
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
