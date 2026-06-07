// apps/web/src/components/editor/panels/color-panel.tsx

import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import { ColorSwatch } from "../common/color-swatch";

type ColorTarget = "fg" | "bg";
type InputMode = "hex" | "rgb" | "hsl";

// --- Color conversion helpers ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const n = Number.parseInt(clean, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const diff = max - min;
  const sum = max + min;
  const l = sum / 2;

  if (diff === 0) return { h: 0, s: 0, l: Math.round(l * 100) };

  const s = l > 0.5 ? diff / (2 - sum) : diff / sum;
  let h = 0;
  if (max === rn) h = ((gn - bn) / diff + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / diff + 2) / 6;
  else h = ((rn - gn) / diff + 4) / 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) {
    rn = c;
    gn = x;
  } else if (h < 120) {
    rn = x;
    gn = c;
  } else if (h < 180) {
    gn = c;
    bn = x;
  } else if (h < 240) {
    gn = x;
    bn = c;
  } else if (h < 300) {
    rn = x;
    gn = 0;
    bn = c;
  } else {
    rn = c;
    gn = 0;
    bn = x;
  }

  const r = Math.round((rn + m) * 255);
  const g = Math.round((gn + m) * 255);
  const b = Math.round((bn + m) * 255);
  return rgbToHex(r, g, b);
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- Sub-components ---

function ColorInputFields({
  mode,
  color,
  onColorChange,
}: {
  mode: InputMode;
  color: string;
  onColorChange: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const rgb = hexToRgb(color);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (mode === "hex") {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground w-6">HEX</span>
        <input
          type="text"
          value={color.toUpperCase()}
          onChange={(e) => {
            let v = e.target.value;
            if (!v.startsWith("#")) v = `#${v}`;
            if (isValidHex(v)) onColorChange(v.toLowerCase());
          }}
          className={cn(
            "flex-1 px-1.5 py-0.5 text-xs font-mono rounded",
            "bg-muted border border-border text-foreground",
            "focus:outline-none focus:ring-1 focus:ring-primary",
          )}
          maxLength={7}
          spellCheck={false}
          aria-label={t.a11y.hexColorValue}
          data-testid="color-hex-input"
        />
      </div>
    );
  }

  if (mode === "rgb") {
    const handleRgb = (channel: "r" | "g" | "b", raw: string) => {
      const v = clamp(Number.parseInt(raw, 10) || 0, 0, 255);
      const next = { ...rgb, [channel]: v };
      onColorChange(rgbToHex(next.r, next.g, next.b));
    };

    return (
      <div className="flex items-center gap-1">
        {(["r", "g", "b"] as const).map((ch) => (
          <div key={ch} className="flex items-center gap-0.5 flex-1">
            <span className="text-[10px] text-muted-foreground uppercase">{ch}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[ch]}
              onChange={(e) => handleRgb(ch, e.target.value)}
              className={cn(
                "w-full px-1 py-0.5 text-xs font-mono rounded",
                "bg-muted border border-border text-foreground",
                "focus:outline-none focus:ring-1 focus:ring-primary",
              )}
              aria-label={`${ch.toUpperCase()} color channel`}
              data-testid={`color-${ch}-input`}
            />
          </div>
        ))}
      </div>
    );
  }

  // HSL mode
  const handleHsl = (channel: "h" | "s" | "l", raw: string) => {
    const maxVal = channel === "h" ? 360 : 100;
    const v = clamp(Number.parseInt(raw, 10) || 0, 0, maxVal);
    const next = { ...hsl, [channel]: v };
    onColorChange(hslToHex(next.h, next.s, next.l));
  };

  return (
    <div className="flex items-center gap-1">
      {(["h", "s", "l"] as const).map((ch) => (
        <div key={ch} className="flex items-center gap-0.5 flex-1">
          <span className="text-[10px] text-muted-foreground uppercase">{ch}</span>
          <input
            type="number"
            min={0}
            max={ch === "h" ? 360 : 100}
            value={hsl[ch]}
            onChange={(e) => handleHsl(ch, e.target.value)}
            className={cn(
              "w-full px-1 py-0.5 text-xs font-mono rounded",
              "bg-muted border border-border text-foreground",
              "focus:outline-none focus:ring-1 focus:ring-primary",
            )}
            aria-label={`${ch.toUpperCase()} color channel`}
            data-testid={`color-${ch}-input`}
          />
        </div>
      ))}
    </div>
  );
}

function ColorPickerPopover({
  color,
  onColorChange,
  onClose,
  recentColors,
  onRecentColorClick,
}: {
  color: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
  recentColors: string[];
  onRecentColorClick: (color: string) => void;
}) {
  const [inputMode, setInputMode] = useState<InputMode>("hex");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className={cn(
        "absolute bottom-full left-0 mb-2 z-50 p-3 rounded-lg shadow-xl",
        "bg-card border border-border w-[220px]",
      )}
      data-testid="color-picker-popover"
    >
      {/* react-colorful picker */}
      <div className="[&_.react-colorful]:!w-full [&_.react-colorful]:!h-[150px] rounded overflow-hidden">
        <HexColorPicker color={color} onChange={onColorChange} />
      </div>

      {/* Input mode tabs */}
      <div className="flex items-center gap-0.5 mt-2.5 mb-1.5">
        {(["hex", "rgb", "hsl"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setInputMode(m)}
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium uppercase rounded transition-colors",
              inputMode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Color input fields */}
      <ColorInputFields mode={inputMode} color={color} onColorChange={onColorChange} />

      {/* Recent colors */}
      {recentColors.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground mb-1.5">Recent</p>
          <div className="flex flex-wrap gap-1">
            {recentColors.map((c) => (
              <ColorSwatch
                key={c}
                color={c}
                size="sm"
                onClick={() => onRecentColorClick(c)}
                data-testid={`recent-color-${c}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export function ColorPanel() {
  const { t } = useTranslation();
  const foregroundColor = useEditorStore((s) => s.foregroundColor);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const recentColors = useEditorStore((s) => s.recentColors);
  const setForegroundColor = useEditorStore((s) => s.setForegroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const swapColors = useEditorStore((s) => s.swapColors);
  const resetColors = useEditorStore((s) => s.resetColors);

  const [pickerTarget, setPickerTarget] = useState<ColorTarget | null>(null);
  const [hexInput, setHexInput] = useState(foregroundColor);

  // Keep hex input in sync with the active color based on pickerTarget
  useEffect(() => {
    const color = pickerTarget === "bg" ? backgroundColor : foregroundColor;
    setHexInput(color);
  }, [foregroundColor, backgroundColor, pickerTarget]);

  const activeColor = pickerTarget === "bg" ? backgroundColor : foregroundColor;
  const setActiveColor = pickerTarget === "bg" ? setBackgroundColor : setForegroundColor;

  const handlePickerChange = useCallback(
    (color: string) => {
      setActiveColor(color);
    },
    [setActiveColor],
  );

  const handleRecentColorClick = useCallback(
    (color: string) => {
      setActiveColor(color);
    },
    [setActiveColor],
  );

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      setHexInput(v);
      if (!v.startsWith("#")) v = `#${v}`;
      if (isValidHex(v)) {
        setActiveColor(v.toLowerCase());
      }
    },
    [setActiveColor],
  );

  const handleHexInputBlur = useCallback(() => {
    // Reset to current active color if invalid
    const color = pickerTarget === "bg" ? backgroundColor : foregroundColor;
    setHexInput(color);
  }, [foregroundColor, backgroundColor, pickerTarget]);

  return (
    <div className="p-3" data-testid="color-panel">
      <div className="flex items-start gap-3">
        {/* Foreground/Background swatches */}
        <div className="relative w-[46px] h-[46px] shrink-0">
          {/* Background swatch (bottom-right) */}
          <button
            type="button"
            onClick={() => setPickerTarget(pickerTarget === "bg" ? null : "bg")}
            className={cn(
              "absolute right-0 bottom-0 w-7 h-7 rounded border-2 transition-shadow",
              pickerTarget === "bg" ? "border-primary ring-1 ring-primary" : "border-border",
            )}
            style={{ backgroundColor: backgroundColor }}
            aria-label={t.a11y.backgroundColor}
            data-testid="bg-color-swatch"
          />
          {/* Foreground swatch (top-left, overlapping) */}
          <button
            type="button"
            onClick={() => setPickerTarget(pickerTarget === "fg" ? null : "fg")}
            className={cn(
              "absolute left-0 top-0 w-7 h-7 rounded border-2 z-10 transition-shadow",
              pickerTarget === "fg" ? "border-primary ring-1 ring-primary" : "border-border",
            )}
            style={{ backgroundColor: foregroundColor }}
            aria-label={t.a11y.foregroundColor}
            data-testid="fg-color-swatch"
          />

          {/* Swap icon (top-right) */}
          <button
            type="button"
            onClick={swapColors}
            className={cn(
              "absolute -right-0.5 -top-0.5 z-20 p-0.5 rounded",
              "text-muted-foreground hover:text-foreground transition-colors",
              "bg-card/80 hover:bg-muted",
            )}
            title="Swap colors (X)"
            aria-label={t.a11y.swapColors}
            data-testid="swap-colors"
          >
            <ArrowLeftRight size={10} />
          </button>

          {/* Reset icon (bottom-left) */}
          <button
            type="button"
            onClick={resetColors}
            className={cn(
              "absolute -left-0.5 -bottom-0.5 z-20 p-0.5 rounded",
              "text-muted-foreground hover:text-foreground transition-colors",
              "bg-card/80 hover:bg-muted",
            )}
            title="Reset colors (D)"
            aria-label={t.a11y.resetColors}
            data-testid="reset-colors"
          >
            <RotateCcw size={10} />
          </button>
        </div>

        {/* Hex input for foreground color */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground block mb-1">Foreground</span>
          <input
            type="text"
            value={hexInput.toUpperCase()}
            onChange={handleHexInputChange}
            onBlur={handleHexInputBlur}
            className={cn(
              "w-full px-2 py-1 text-xs font-mono rounded",
              "bg-muted border border-border text-foreground",
              "focus:outline-none focus:ring-1 focus:ring-primary",
            )}
            maxLength={7}
            spellCheck={false}
            aria-label={t.a11y.foregroundHex}
            data-testid="foreground-hex-input"
          />
        </div>
      </div>

      {/* Color picker popover */}
      {pickerTarget !== null && (
        <div className="relative mt-2">
          <ColorPickerPopover
            color={activeColor}
            onColorChange={handlePickerChange}
            onClose={() => setPickerTarget(null)}
            recentColors={recentColors}
            onRecentColorClick={handleRecentColorClick}
          />
        </div>
      )}
    </div>
  );
}
