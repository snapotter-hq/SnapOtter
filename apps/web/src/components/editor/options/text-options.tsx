// apps/web/src/components/editor/options/text-options.tsx

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { TextAttrs } from "@/types/editor";
import { ensureFontLoaded, getAllFonts } from "../common/font-loader";

// ---------------------------------------------------------------------------
// Default attrs used when no text object is selected (next-text settings)
// ---------------------------------------------------------------------------

const DEFAULT_TEXT_ATTRS: TextAttrs = {
  x: 0,
  y: 0,
  text: "",
  fontFamily: "Arial",
  fontSize: 24,
  fontStyle: "normal",
  fontVariant: "normal",
  textDecoration: "",
  align: "left",
  fill: "#000000",
  lineHeight: 1.2,
  letterSpacing: 0,
  rotation: 0,
  opacity: 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSelectedTextAttrs(): TextAttrs | null {
  const { selectedObjectIds, objects } = useEditorStore.getState();
  if (selectedObjectIds.length !== 1) return null;
  const obj = objects.find((o) => o.id === selectedObjectIds[0] && o.type === "text");
  return obj ? (obj.attrs as TextAttrs) : null;
}

function updateSelected(partial: Partial<TextAttrs>) {
  const { selectedObjectIds } = useEditorStore.getState();
  for (const id of selectedObjectIds) {
    useEditorStore.getState().updateObject(id, partial);
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  label,
  onChange,
  width = "w-16",
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (v: number) => void;
  width?: string;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number.parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      className={cn(
        "h-7 rounded border border-border bg-background px-1.5 text-xs text-center",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        width,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Font Dropdown
// ---------------------------------------------------------------------------

function FontDropdown({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fonts = useMemo(() => getAllFonts(), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback(
    async (name: string) => {
      await ensureFontLoaded(name);
      onChange(name);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={t.a11y.fontFamily}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2 rounded border border-border bg-background",
          "text-xs hover:bg-muted truncate max-w-[160px]",
        )}
        style={{ fontFamily: value }}
      >
        <Type size={12} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{value}</span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full left-0 mt-1 z-50 w-56 max-h-72 overflow-y-auto",
            "rounded-md border border-border bg-popover shadow-md",
          )}
        >
          {/* System fonts */}
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            System Fonts
          </div>
          {fonts.system.map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => handleSelect(name)}
              className={cn(
                "w-full text-start px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                value === name && "bg-muted font-medium",
              )}
              style={{ fontFamily: name }}
            >
              {name}
            </button>
          ))}

          {/* Fonts bundled with the app (self-hosted, no network fetch) */}
          {fonts.selfHosted.length > 0 && (
            <>
              <div className="h-px bg-border my-1" />
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                App Fonts
              </div>
              {fonts.selfHosted.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => handleSelect(name)}
                  className={cn(
                    "w-full text-start px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                    value === name && "bg-muted font-medium",
                  )}
                  style={{ fontFamily: name }}
                >
                  {name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TextOptions() {
  const { t } = useTranslation();
  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const objects = useEditorStore((s) => s.objects);

  // Derive current attrs from the selected text object, fall back to defaults
  const selectedAttrs = useMemo(() => {
    if (selectedObjectIds.length !== 1) return null;
    const obj = objects.find((o) => o.id === selectedObjectIds[0] && o.type === "text");
    return obj ? (obj.attrs as TextAttrs) : null;
  }, [selectedObjectIds, objects]);

  const attrs = selectedAttrs ?? DEFAULT_TEXT_ATTRS;

  const isBold = attrs.fontStyle.includes("bold");
  const isItalic = attrs.fontStyle.includes("italic");
  const hasUnderline = attrs.textDecoration.includes("underline");
  const hasStrikethrough = attrs.textDecoration.includes("line-through");
  const isAreaText = attrs.wrap !== undefined;

  const toggleBold = () => {
    const current = getSelectedTextAttrs();
    if (!current) return;
    const wasBold = current.fontStyle.includes("bold");
    const parts = current.fontStyle.split(" ").filter((p) => p !== "bold" && p !== "");
    if (!wasBold) parts.push("bold");
    updateSelected({ fontStyle: parts.join(" ") || "normal" });
  };

  const toggleItalic = () => {
    const current = getSelectedTextAttrs();
    if (!current) return;
    const wasItalic = current.fontStyle.includes("italic");
    const parts = current.fontStyle.split(" ").filter((p) => p !== "italic" && p !== "");
    if (!wasItalic) parts.push("italic");
    updateSelected({ fontStyle: parts.join(" ") || "normal" });
  };

  const toggleUnderline = () => {
    const current = getSelectedTextAttrs();
    if (!current) return;
    const had = current.textDecoration.includes("underline");
    const parts = current.textDecoration.split(" ").filter((p) => p !== "underline" && p !== "");
    if (!had) parts.push("underline");
    updateSelected({ textDecoration: parts.join(" ") || "none" });
  };

  const toggleStrikethrough = () => {
    const current = getSelectedTextAttrs();
    if (!current) return;
    const had = current.textDecoration.includes("line-through");
    const parts = current.textDecoration.split(" ").filter((p) => p !== "line-through" && p !== "");
    if (!had) parts.push("line-through");
    updateSelected({ textDecoration: parts.join(" ") || "none" });
  };

  const toggleTextMode = () => {
    const current = getSelectedTextAttrs();
    if (!current) return;
    if (current.wrap !== undefined) {
      // Switch to point text: remove width/height/wrap
      updateSelected({
        width: undefined,
        height: undefined,
        wrap: undefined,
      });
    } else {
      // Switch to area text
      updateSelected({
        width: 200,
        height: 100,
        wrap: "word",
      });
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="text-options">
      {/* Font family */}
      <FontDropdown
        value={attrs.fontFamily}
        onChange={(name) => updateSelected({ fontFamily: name })}
      />

      {/* Font size */}
      <NumberInput
        value={attrs.fontSize}
        min={1}
        max={999}
        step={1}
        label="Font size"
        onChange={(v) => updateSelected({ fontSize: v })}
        width="w-14"
      />

      <div className="h-4 w-px bg-border" />

      {/* Bold / Italic / Underline / Strikethrough */}
      <div className="flex items-center gap-0.5">
        <ToggleButton active={isBold} onClick={toggleBold} label="Bold">
          <Bold size={14} />
        </ToggleButton>
        <ToggleButton active={isItalic} onClick={toggleItalic} label="Italic">
          <Italic size={14} />
        </ToggleButton>
        <ToggleButton active={hasUnderline} onClick={toggleUnderline} label="Underline">
          <Underline size={14} />
        </ToggleButton>
        <ToggleButton active={hasStrikethrough} onClick={toggleStrikethrough} label="Strikethrough">
          <Strikethrough size={14} />
        </ToggleButton>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        <ToggleButton
          active={attrs.align === "left"}
          onClick={() => updateSelected({ align: "left" })}
          label="Align left"
        >
          <AlignLeft size={14} />
        </ToggleButton>
        <ToggleButton
          active={attrs.align === "center"}
          onClick={() => updateSelected({ align: "center" })}
          label="Align center"
        >
          <AlignCenter size={14} />
        </ToggleButton>
        <ToggleButton
          active={attrs.align === "right"}
          onClick={() => updateSelected({ align: "right" })}
          label="Align right"
        >
          <AlignRight size={14} />
        </ToggleButton>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Line height */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">LH</span>
        <NumberInput
          value={attrs.lineHeight}
          min={0.5}
          max={3.0}
          step={0.1}
          label="Line height"
          onChange={(v) => updateSelected({ lineHeight: v })}
          width="w-14"
        />
      </div>

      {/* Letter spacing */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">LS</span>
        <NumberInput
          value={attrs.letterSpacing}
          min={-5}
          max={20}
          step={0.5}
          label="Letter spacing"
          onChange={(v) => updateSelected({ letterSpacing: v })}
          width="w-14"
        />
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Color swatch */}
      <label className="relative flex items-center" title="Text color">
        <div
          className="w-6 h-6 rounded border border-border cursor-pointer"
          style={{ backgroundColor: attrs.fill }}
        />
        <input
          type="color"
          aria-label={t.a11y.textColor}
          value={attrs.fill}
          onChange={(e) => updateSelected({ fill: e.target.value })}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>

      <div className="h-4 w-px bg-border" />

      {/* Point / Area text toggle */}
      <button
        type="button"
        title={isAreaText ? "Switch to Point Text" : "Switch to Area Text"}
        aria-label={isAreaText ? "Switch to Point Text" : "Switch to Area Text"}
        onClick={toggleTextMode}
        className={cn(
          "h-7 px-2 rounded border border-border text-xs transition-colors",
          "hover:bg-muted",
        )}
      >
        {isAreaText ? "Area" : "Point"}
      </button>
    </div>
  );
}
