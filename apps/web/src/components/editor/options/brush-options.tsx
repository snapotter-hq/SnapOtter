// apps/web/src/components/editor/options/brush-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";

const BRUSH_OPTION_TOOLS = new Set<ToolType>(["brush", "eraser", "pencil"]);

export function BrushOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushOpacity = useEditorStore((s) => s.brushOpacity);
  const brushHardness = useEditorStore((s) => s.brushHardness);
  const brushFlow = useEditorStore((s) => s.brushFlow);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setBrushOpacity = useEditorStore((s) => s.setBrushOpacity);
  const setBrushHardness = useEditorStore((s) => s.setBrushHardness);
  const setBrushFlow = useEditorStore((s) => s.setBrushFlow);
  const eraserMode = useEditorStore((s) => s.eraserMode);
  const setEraserMode = useEditorStore((s) => s.setEraserMode);

  if (!BRUSH_OPTION_TOOLS.has(activeTool)) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Eraser mode selector */}
      {activeTool === "eraser" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground w-12 shrink-0">
            {t.editor.options.shared.mode}
          </span>
          <div className="flex gap-0.5 flex-1">
            <button
              type="button"
              onClick={() => setEraserMode("brush")}
              className={`flex-1 text-xs py-1 rounded ${eraserMode === "brush" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t.editor.options.brush.eraserBrush}
            </button>
            <button
              type="button"
              onClick={() => setEraserMode("block")}
              className={`flex-1 text-xs py-1 rounded ${eraserMode === "block" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t.editor.options.brush.eraserBlock}
            </button>
          </div>
        </div>
      )}

      {/* Size */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.options.shared.size}
        <input
          type="range"
          min={1}
          max={500}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-20"
        />
        <input
          type="number"
          min={1}
          max={500}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
        />
      </label>

      {/* Opacity */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.shapes.opacity}
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(brushOpacity * 100)}
          onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
          className="w-20"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(brushOpacity * 100)}
          onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
          className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
        />
        <span className="text-[10px]">%</span>
      </label>

      {/* Hardness (not for pencil -- pencil is always hard) */}
      {activeTool !== "pencil" && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.editor.options.shared.hardness}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(brushHardness * 100)}
            onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
            className="w-20"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(brushHardness * 100)}
            onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
            className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
          />
          <span className="text-[10px]">%</span>
        </label>
      )}

      {/* Flow (not for pencil) */}
      {activeTool !== "pencil" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">
            {t.editor.options.shared.flow}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(brushFlow * 100)}
            onChange={(e) => setBrushFlow(Number(e.target.value) / 100)}
            className="flex-1 min-w-0"
          />
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-end">
            {Math.round(brushFlow * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
