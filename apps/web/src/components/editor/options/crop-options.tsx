import { ArrowLeftRight, Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { ASPECT_RATIOS } from "@/components/editor/tools/crop-tool";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

// ---------------------------------------------------------------------------
// CropOptions -- aspect ratio dropdown, W/H inputs, apply/cancel
// ---------------------------------------------------------------------------

export function CropOptions() {
  const { t } = useTranslation();
  const cropState = useEditorStore((s) => s.cropState);
  const setCropState = useEditorStore((s) => s.setCropState);
  const applyCrop = useEditorStore((s) => s.applyCrop);
  const [selectedRatio, setSelectedRatio] = useState("Free");

  const handleAspectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const label = e.target.value;
      setSelectedRatio(label);
      if (!cropState) return;

      const preset = ASPECT_RATIOS.find((p) => p.label === label);
      if (!preset || !preset.value) {
        setCropState({ ...cropState, aspectRatio: null });
        return;
      }

      const ratio = preset.value;
      let w = cropState.width;
      let h = w / ratio;
      if (h > cropState.height * 1.5) {
        h = cropState.height;
        w = h * ratio;
      }
      setCropState({ ...cropState, width: w, height: h, aspectRatio: label });
    },
    [cropState, setCropState],
  );

  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!cropState) return;
      const w = Math.max(1, Number(e.target.value) || 1);
      setCropState({ ...cropState, width: w });
    },
    [cropState, setCropState],
  );

  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!cropState) return;
      const h = Math.max(1, Number(e.target.value) || 1);
      setCropState({ ...cropState, height: h });
    },
    [cropState, setCropState],
  );

  const handleSwap = useCallback(() => {
    if (!cropState) return;
    setCropState({
      ...cropState,
      width: cropState.height,
      height: cropState.width,
    });
  }, [cropState, setCropState]);

  const handleApply = useCallback(() => {
    applyCrop();
  }, [applyCrop]);

  const handleCancel = useCallback(() => {
    setCropState(null);
  }, [setCropState]);

  const inputCn = cn(
    "h-6 w-16 rounded border border-border bg-card px-1.5 text-xs text-foreground",
    "focus:border-primary focus:outline-none",
  );

  return (
    <div className="flex items-center gap-3">
      {/* Aspect ratio dropdown */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="crop-aspect" className="text-xs text-muted-foreground">
          Ratio:
        </label>
        <select
          id="crop-aspect"
          value={selectedRatio}
          onChange={handleAspectChange}
          className={cn(
            "h-6 rounded border border-border bg-card px-1.5 text-xs text-foreground",
            "focus:border-primary focus:outline-none",
          )}
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r.label} value={r.label}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Width and Height inputs */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="crop-width" className="text-xs text-muted-foreground">
          W:
        </label>
        <input
          id="crop-width"
          type="number"
          min={1}
          value={cropState ? Math.round(cropState.width) : ""}
          onChange={handleWidthChange}
          className={inputCn}
        />
      </div>

      <button
        type="button"
        onClick={handleSwap}
        title="Swap dimensions"
        aria-label={t.a11y.swapDimensions}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-1.5">
        <label htmlFor="crop-height" className="text-xs text-muted-foreground">
          H:
        </label>
        <input
          id="crop-height"
          type="number"
          min={1}
          value={cropState ? Math.round(cropState.height) : ""}
          onChange={handleHeightChange}
          className={inputCn}
        />
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Apply / Cancel */}
      <button
        type="button"
        onClick={handleApply}
        title="Apply Crop (Enter)"
        aria-label={t.a11y.applyCrop}
        className={cn(
          "flex h-7 items-center gap-1 rounded bg-primary px-2.5 text-xs text-primary-foreground",
          "hover:bg-primary/90 transition-colors",
        )}
      >
        <Check className="h-3.5 w-3.5" />
        Apply
      </button>
      <button
        type="button"
        onClick={handleCancel}
        title="Cancel Crop (Escape)"
        aria-label={t.a11y.cancelCrop}
        className={cn(
          "flex h-7 items-center gap-1 rounded border border-border px-2.5 text-xs",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
    </div>
  );
}
