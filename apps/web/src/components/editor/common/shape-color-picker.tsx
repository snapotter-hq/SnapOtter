// apps/web/src/components/editor/common/shape-color-picker.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { RgbaColorPicker } from "react-colorful";
import { createPortal } from "react-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHECKERBOARD =
  "repeating-conic-gradient(rgba(128,128,128,0.3) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ShapeColorPickerProps {
  label: string;
  color: string | null;
  opacity: number;
  onColorChange: (color: string | null) => void;
  onOpacityChange: (opacity: number) => void;
  allowNone?: boolean;
}

export function ShapeColorPicker({
  label,
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  allowNone = true,
}: ShapeColorPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(color ?? "#000000");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (color) setHexInput(color);
  }, [color]);

  useEffect(() => {
    if (!open) return;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 6, left: rect.left });
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const rgbaValue = color ? { ...hexToRgb(color), a: opacity } : { r: 0, g: 0, b: 0, a: 0 };

  const handleRgbaChange = useCallback(
    (rgba: { r: number; g: number; b: number; a: number }) => {
      const hex = rgbToHex(rgba.r, rgba.g, rgba.b);
      onColorChange(hex);
      onOpacityChange(rgba.a);
      setHexInput(hex);
    },
    [onColorChange, onOpacityChange],
  );

  const handleHexCommit = useCallback(
    (value: string) => {
      let hex = value.trim();
      if (!hex.startsWith("#")) hex = `#${hex}`;
      if (/^#[0-9a-f]{6}$/i.test(hex)) {
        onColorChange(hex.toLowerCase());
        setHexInput(hex.toLowerCase());
      } else {
        setHexInput(color ?? "#000000");
      }
    },
    [color, onColorChange],
  );

  const isNone = color === null;

  return (
    <div className="relative flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative w-6 h-6 rounded border border-border cursor-pointer",
          "hover:ring-1 hover:ring-primary/50 transition-shadow shrink-0",
        )}
        style={{
          background: isNone ? undefined : CHECKERBOARD,
        }}
        aria-label={format(t.editor.ui.shapeColorPicker.ariaLabel, { label })}
      >
        {isNone ? (
          <span className="absolute inset-0 rounded bg-white">
            <span
              className="absolute inset-0 rounded"
              style={{
                background:
                  "linear-gradient(to top right, transparent calc(50% - 1px), #ef4444 calc(50% - 1px), #ef4444 calc(50% + 1px), transparent calc(50% + 1px))",
              }}
            />
          </span>
        ) : (
          <span
            className="absolute inset-0 rounded"
            style={{
              backgroundColor: color,
              opacity,
            }}
          />
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={cn(
              "fixed z-[9999] p-3 rounded-lg shadow-xl",
              "bg-card border border-border w-[220px]",
            )}
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            {allowNone && (
              <button
                type="button"
                onClick={() => {
                  if (isNone) {
                    onColorChange("#000000");
                    setHexInput("#000000");
                  } else {
                    onColorChange(null);
                  }
                }}
                className={cn(
                  "w-full mb-2 px-2 py-1 text-xs rounded border transition-colors",
                  isNone
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {isNone
                  ? format(t.editor.ui.shapeColorPicker.noneSelected, { label })
                  : format(t.editor.ui.shapeColorPicker.setNone, { label })}
              </button>
            )}

            {!isNone && (
              <>
                <div className="[&_.react-colorful]:!w-full [&_.react-colorful]:!h-[150px] rounded overflow-hidden">
                  <RgbaColorPicker color={rgbaValue} onChange={handleRgbaChange} />
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">#</span>
                  <input
                    type="text"
                    value={hexInput.replace("#", "")}
                    onChange={(e) => setHexInput(`#${e.target.value}`)}
                    onBlur={(e) => handleHexCommit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleHexCommit(e.currentTarget.value);
                    }}
                    maxLength={6}
                    className="flex-1 h-6 text-xs bg-muted border border-border rounded px-1.5 font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground font-medium ms-1">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
