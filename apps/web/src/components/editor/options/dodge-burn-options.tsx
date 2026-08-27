// apps/web/src/components/editor/options/dodge-burn-options.tsx

import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";

const DODGE_BURN_TOOLS = new Set<ToolType>(["dodge", "burn", "sponge"]);

export function DodgeBurnOptions() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const dodgeBurnRange = useEditorStore((s) => s.dodgeBurnRange);
  const dodgeBurnExposure = useEditorStore((s) => s.dodgeBurnExposure);
  const spongeMode = useEditorStore((s) => s.spongeMode);
  const spongeFlow = useEditorStore((s) => s.spongeFlow);
  const setDodgeBurnRange = useEditorStore((s) => s.setDodgeBurnRange);
  const setDodgeBurnExposure = useEditorStore((s) => s.setDodgeBurnExposure);
  const setSpongeMode = useEditorStore((s) => s.setSpongeMode);
  const setSpongeFlow = useEditorStore((s) => s.setSpongeFlow);

  if (!DODGE_BURN_TOOLS.has(activeTool)) return null;

  const isDodgeBurn = activeTool === "dodge" || activeTool === "burn";

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
          <option value="dodge">{t.editor.options.dodgeBurn.dodge}</option>
          <option value="burn">{t.editor.options.dodgeBurn.burn}</option>
          <option value="sponge">{t.editor.options.dodgeBurn.sponge}</option>
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
          className="w-16"
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

      {/* Range (dodge/burn only) */}
      {isDodgeBurn && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.editor.options.dodgeBurn.range}
          <select
            value={dodgeBurnRange}
            onChange={(e) =>
              setDodgeBurnRange(e.target.value as "shadows" | "midtones" | "highlights")
            }
            className="h-6 text-xs bg-muted border border-border rounded px-1"
          >
            <option value="shadows">{t.editor.options.dodgeBurn.shadows}</option>
            <option value="midtones">{t.editor.options.dodgeBurn.midtones}</option>
            <option value="highlights">{t.editor.options.dodgeBurn.highlights}</option>
          </select>
        </label>
      )}

      {/* Exposure (dodge/burn only) */}
      {isDodgeBurn && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.editor.options.dodgeBurn.exposure}
          <input
            type="range"
            min={1}
            max={100}
            value={dodgeBurnExposure}
            onChange={(e) => setDodgeBurnExposure(Number(e.target.value))}
            className="w-16"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={dodgeBurnExposure}
            onChange={(e) => setDodgeBurnExposure(Number(e.target.value))}
            className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
          />
          <span className="text-[10px]">%</span>
        </label>
      )}

      {/* Sponge mode */}
      {activeTool === "sponge" && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.editor.options.shared.mode}
          <select
            value={spongeMode}
            onChange={(e) => setSpongeMode(e.target.value as "saturate" | "desaturate")}
            className="h-6 text-xs bg-muted border border-border rounded px-1"
          >
            <option value="saturate">{t.editor.options.dodgeBurn.saturate}</option>
            <option value="desaturate">{t.editor.options.dodgeBurn.desaturate}</option>
          </select>
        </label>
      )}

      {/* Flow (sponge only) */}
      {activeTool === "sponge" && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.editor.options.shared.flow}
          <input
            type="range"
            min={1}
            max={100}
            value={spongeFlow}
            onChange={(e) => setSpongeFlow(Number(e.target.value))}
            className="w-16"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={spongeFlow}
            onChange={(e) => setSpongeFlow(Number(e.target.value))}
            className="w-12 h-6 text-xs text-center bg-muted border border-border rounded px-1"
          />
          <span className="text-[10px]">%</span>
        </label>
      )}
    </div>
  );
}
