// apps/web/src/components/editor/editor-status-bar.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

export function EditorStatusBar() {
  const { t } = useTranslation();
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex items-center justify-between h-7 px-3 bg-background border-t border-border text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3" data-testid="status-cursor">
        {sourceImageUrl && (
          <>
            <span data-testid="status-cursor-x">X: {cursorPosition.x}</span>
            <span data-testid="status-cursor-y">Y: {cursorPosition.y}</span>
          </>
        )}
      </div>
      <div data-testid="status-dimensions">
        {sourceImageUrl && `${canvasSize.width} x ${canvasSize.height} px`}
      </div>
      <div className="flex items-center gap-1" data-testid="status-zoom">
        <input
          aria-label={t.a11y.zoomControls}
          type="number"
          value={zoomPercent}
          onChange={(e) => {
            const val = Number.parseFloat(e.target.value);
            if (!Number.isNaN(val) && val > 0) setZoom(val / 100);
          }}
          className="w-14 bg-transparent text-end text-xs border-none outline-none"
          min={0.01}
          max={6400}
          step={0.1}
        />
        <span>%</span>
      </div>
    </div>
  );
}
