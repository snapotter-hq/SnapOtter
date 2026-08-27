// apps/web/src/components/editor/options/gradient-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

export function GradientOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const gradientType = useEditorStore((s) => s.gradientType);
  const gradientOpacity = useEditorStore((s) => s.gradientOpacity);
  const gradientReverse = useEditorStore((s) => s.gradientReverse);
  const setGradientType = useEditorStore((s) => s.setGradientType);
  const setGradientOpacity = useEditorStore((s) => s.setGradientOpacity);
  const setGradientReverse = useEditorStore((s) => s.setGradientReverse);

  if (activeTool !== "gradient") return null;

  const opacityPercent = Math.round(gradientOpacity * 100);

  return (
    <div className="flex items-center gap-3">
      {/* Type toggle */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.options.gradient.type}
        <select
          value={gradientType}
          onChange={(e) => setGradientType(e.target.value as "linear" | "radial")}
          className="h-6 text-xs bg-muted border border-border rounded px-1"
        >
          <option value="linear">{t.editor.options.gradient.linear}</option>
          <option value="radial">{t.editor.options.gradient.radial}</option>
        </select>
      </label>

      {/* Opacity */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t.editor.shapes.opacity}
        <input
          type="range"
          min={0}
          max={100}
          value={opacityPercent}
          onChange={(e) => setGradientOpacity(Number(e.target.value) / 100)}
          className="w-20"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={opacityPercent}
          onChange={(e) => setGradientOpacity(Number(e.target.value) / 100)}
          className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
        />
        <span className="text-[10px]">%</span>
      </label>

      {/* Reverse */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={gradientReverse}
          onChange={(e) => setGradientReverse(e.target.checked)}
          className="accent-primary"
        />
        {t.editor.options.gradient.reverse}
      </label>
    </div>
  );
}
