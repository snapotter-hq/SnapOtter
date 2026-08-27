// apps/web/src/components/editor/options/pixel-brush-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";

const PIXEL_BRUSH_TOOLS = new Set<ToolType>(["blur-brush", "sharpen-brush", "smudge"]);

export function PixelBrushOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const strength = useEditorStore((s) => s.pixelBrushStrength);
  const setPixelBrushStrength = useEditorStore((s) => s.setPixelBrushStrength);

  if (!PIXEL_BRUSH_TOOLS.has(activeTool)) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Tool toggle */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.options.shared.tool}
        <select
          value={activeTool}
          onChange={(e) => setTool(e.target.value as ToolType)}
          className="h-6 text-xs bg-muted border border-border rounded px-1"
        >
          <option value="blur-brush">{t.editor.options.pixelBrush.blur}</option>
          <option value="sharpen-brush">{t.editor.options.pixelBrush.sharpen}</option>
          <option value="smudge">{t.editor.options.pixelBrush.smudge}</option>
        </select>
      </label>

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

      {/* Strength */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.options.pixelBrush.strength}
        <input
          type="range"
          min={1}
          max={100}
          value={strength}
          onChange={(e) => setPixelBrushStrength(Number(e.target.value))}
          className="w-20"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={strength}
          onChange={(e) => setPixelBrushStrength(Number(e.target.value))}
          className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
        />
        <span className="text-[10px]">%</span>
      </label>
    </div>
  );
}
