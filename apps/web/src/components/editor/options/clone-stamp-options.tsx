// apps/web/src/components/editor/options/clone-stamp-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

export function CloneStampOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushOpacity = useEditorStore((s) => s.brushOpacity);
  const brushHardness = useEditorStore((s) => s.brushHardness);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setBrushOpacity = useEditorStore((s) => s.setBrushOpacity);
  const setBrushHardness = useEditorStore((s) => s.setBrushHardness);
  const cloneAligned = useEditorStore((s) => s.cloneAligned);
  const setCloneAligned = useEditorStore((s) => s.setCloneAligned);

  if (activeTool !== "clone-stamp") return null;

  return (
    <div className="flex items-center gap-3">
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

      {/* Hardness */}
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

      {/* Aligned */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={cloneAligned}
          onChange={(e) => setCloneAligned(e.target.checked)}
          className="accent-primary"
        />
        {t.editor.options.cloneStamp.aligned}
      </label>

      <span className="text-[10px] text-muted-foreground">
        {t.editor.options.cloneStamp.altClickHint}
      </span>
    </div>
  );
}
