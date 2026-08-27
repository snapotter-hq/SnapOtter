// apps/web/src/components/editor/options/eyedropper-options.tsx

import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import { ColorSwatch } from "../common/color-swatch";

export type SampleSize = 1 | 3 | 5;

const SAMPLE_SIZES: { label: string; value: SampleSize }[] = [
  { label: "Point (1x1)", value: 1 },
  { label: "3x3 Average", value: 3 },
  { label: "5x5 Average", value: 5 },
];

interface EyedropperOptionsProps {
  sampleSize: SampleSize;
  onSampleSizeChange: (size: SampleSize) => void;
  sampledColor: string | null;
}

export function EyedropperOptions({
  sampleSize,
  onSampleSizeChange,
  sampledColor,
}: EyedropperOptionsProps) {
  const { t } = useTranslation();
  const foregroundColor = useEditorStore((s) => s.foregroundColor);
  const [open, setOpen] = useState(false);

  const displayColor = sampledColor ?? foregroundColor;

  return (
    <div className="flex items-center gap-3">
      {/* Sample size dropdown */}
      <div className="relative">
        <span className="text-xs text-muted-foreground me-1.5">
          {t.editor.options.eyedropper.sampleLabel}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 text-xs rounded",
            "bg-muted border border-border text-foreground",
            "hover:bg-muted/80 transition-colors",
          )}
          data-testid="sample-size-dropdown"
        >
          {SAMPLE_SIZES.find((s) => s.value === sampleSize)?.label}
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            className="text-muted-foreground"
            aria-hidden="true"
            role="img"
          >
            <title>{t.editor.options.eyedropper.toggleDropdown}</title>
            <path
              d="M1 1l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open && (
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for closing dropdown */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: escape handled via parent */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className={cn(
                "absolute top-full left-0 mt-1 z-50 py-1 rounded-md shadow-lg",
                "bg-card border border-border min-w-[140px]",
              )}
            >
              {SAMPLE_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    onSampleSizeChange(s.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-start px-3 py-1.5 text-xs transition-colors",
                    s.value === sampleSize
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Current sampled color preview */}
      <div className="flex items-center gap-2">
        <ColorSwatch color={displayColor} size="sm" data-testid="eyedropper-sampled-color" />
        <span className="text-xs font-mono text-muted-foreground uppercase">{displayColor}</span>
      </div>
    </div>
  );
}
