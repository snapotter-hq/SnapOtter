// apps/web/src/components/editor/common/fill-dialog.tsx

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn, generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject } from "@/types/editor";

type FillContent = "foreground" | "background" | "color" | "white" | "black" | "50gray";

interface FillDialogProps {
  open: boolean;
  onClose: () => void;
}

const FILL_PRESETS: { value: FillContent; label: string }[] = [
  { value: "foreground", label: "Foreground Color" },
  { value: "background", label: "Background Color" },
  { value: "color", label: "Color..." },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "50gray", label: "50% Gray" },
];

function resolveColor(
  content: FillContent,
  customColor: string,
  foreground: string,
  background: string,
): string {
  switch (content) {
    case "foreground":
      return foreground;
    case "background":
      return background;
    case "color":
      return customColor;
    case "white":
      return "#ffffff";
    case "black":
      return "#000000";
    case "50gray":
      return "#808080";
  }
}

export function FillDialog({ open, onClose }: FillDialogProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<FillContent>("foreground");
  const [customColor, setCustomColor] = useState("#ff0000");
  const [opacity, setOpacity] = useState(100);

  const foregroundColor = useEditorStore((s) => s.foregroundColor);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const addObject = useEditorStore((s) => s.addObject);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleFill = useCallback(() => {
    const fillColor = resolveColor(content, customColor, foregroundColor, backgroundColor);

    // Create a canvas with the solid fill
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const dataUrl = canvas.toDataURL();

    const obj: CanvasObject = {
      id: generateId(),
      type: "image",
      layerId: activeLayerId,
      attrs: {
        x: 0,
        y: 0,
        width: canvasSize.width,
        height: canvasSize.height,
        rotation: 0,
        opacity: 1,
        src: dataUrl,
      },
    };

    addObject(obj);
    onClose();
  }, [
    content,
    customColor,
    foregroundColor,
    backgroundColor,
    canvasSize,
    activeLayerId,
    opacity,
    addObject,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-80 rounded-lg bg-card border border-border shadow-xl p-4"
        role="dialog"
        aria-label={t.a11y.fill}
      >
        <h3 className="text-sm font-semibold text-foreground mb-3">Fill</h3>

        {/* Content selector */}
        <div className="mb-3">
          <span className="text-xs text-muted-foreground mb-1 block">Contents</span>
          <select
            value={content}
            onChange={(e) => setContent(e.target.value as FillContent)}
            className="w-full h-8 text-sm bg-muted border border-border rounded px-2"
          >
            {FILL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom color picker (only when "color" selected) */}
        {content === "color" && (
          <div className="mb-3">
            <span className="text-xs text-muted-foreground mb-1 block">Custom Color</span>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-full h-8 border border-border rounded cursor-pointer"
            />
          </div>
        )}

        {/* Opacity */}
        <div className="mb-4">
          <span className="text-xs text-muted-foreground mb-1 block">Opacity</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-14 h-7 text-xs text-center bg-muted border border-border rounded px-1"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        {/* Color preview */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Preview:</span>
          <div
            className="w-8 h-8 rounded border border-border"
            style={{
              backgroundColor: resolveColor(content, customColor, foregroundColor, backgroundColor),
              opacity: opacity / 100,
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-3 py-1.5 text-xs rounded border border-border",
              "hover:bg-muted transition-colors",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFill}
            className={cn(
              "px-3 py-1.5 text-xs rounded",
              "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
            )}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
