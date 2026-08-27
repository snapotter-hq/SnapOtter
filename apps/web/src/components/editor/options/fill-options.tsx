// apps/web/src/components/editor/options/fill-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

export function FillOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const tolerance = useEditorStore((s) => s.fillTolerance);
  const contiguous = useEditorStore((s) => s.fillContiguous);
  const setFillTolerance = useEditorStore((s) => s.setFillTolerance);
  const setFillContiguous = useEditorStore((s) => s.setFillContiguous);

  if (activeTool !== "fill") return null;

  return (
    <div className="flex items-center gap-3">
      {/* Tolerance */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.options.fill.tolerance}
        <input
          type="range"
          min={0}
          max={255}
          value={tolerance}
          onChange={(e) => setFillTolerance(Number(e.target.value))}
          className="w-20"
        />
        <input
          type="number"
          min={0}
          max={255}
          value={tolerance}
          onChange={(e) => setFillTolerance(Number(e.target.value))}
          className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
        />
      </label>

      {/* Contiguous */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={contiguous}
          onChange={(e) => setFillContiguous(e.target.checked)}
          className="accent-primary"
        />
        {t.editor.options.shared.contiguous}
      </label>
    </div>
  );
}
