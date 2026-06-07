import { Check, FlipHorizontal2, FlipVertical2, Lock, Unlock, X } from "lucide-react";
import { useCallback } from "react";
import type { TransformToolApi } from "@/components/editor/tools/transform-tool";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// TransformOptions -- X/Y/W/H/rotation inputs, aspect lock, flip buttons
// ---------------------------------------------------------------------------

function NumericInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) onChange(v);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}:
      </label>
      <input
        id={id}
        type="number"
        value={Math.round(value)}
        onChange={handleChange}
        min={min}
        max={max}
        step={step ?? 1}
        className={cn(
          "h-6 w-16 rounded border border-border bg-card px-1.5 text-xs text-foreground",
          "focus:border-primary focus:outline-none",
        )}
      />
    </div>
  );
}

export function TransformOptions({ api }: { api: TransformToolApi }) {
  const { t } = useTranslation();
  const {
    values,
    lockedAspect,
    setLockedAspect,
    setValues,
    flipHorizontal,
    flipVertical,
    applyTransform,
    cancelTransform,
  } = api;

  return (
    <div className="flex items-center gap-3">
      <NumericInput
        id="transform-x"
        label="X"
        value={values.x}
        onChange={(v) => setValues({ x: v })}
      />
      <NumericInput
        id="transform-y"
        label="Y"
        value={values.y}
        onChange={(v) => setValues({ y: v })}
      />

      <div className="h-4 w-px bg-border" />

      <NumericInput
        id="transform-w"
        label="W"
        value={values.width}
        min={1}
        onChange={(v) => setValues({ width: v })}
      />

      <button
        type="button"
        onClick={() => setLockedAspect(!lockedAspect)}
        title={lockedAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
        aria-label={lockedAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
        aria-pressed={lockedAspect}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          lockedAspect
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {lockedAspect ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>

      <NumericInput
        id="transform-h"
        label="H"
        value={values.height}
        min={1}
        onChange={(v) => setValues({ height: v })}
      />

      <div className="h-4 w-px bg-border" />

      <NumericInput
        id="transform-rotation"
        label="Rotation"
        value={values.rotation}
        min={-360}
        max={360}
        onChange={(v) => setValues({ rotation: v })}
      />

      <div className="h-4 w-px bg-border" />

      <button
        type="button"
        onClick={flipHorizontal}
        title="Flip Horizontal"
        aria-label={t.a11y.flipHorizontal}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <FlipHorizontal2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={flipVertical}
        title="Flip Vertical"
        aria-label={t.a11y.flipVertical}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <FlipVertical2 className="h-4 w-4" />
      </button>

      <div className="h-5 w-px bg-border mx-1" />
      <button
        type="button"
        onClick={cancelTransform}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Cancel"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={applyTransform}
        className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        title="Apply"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}
