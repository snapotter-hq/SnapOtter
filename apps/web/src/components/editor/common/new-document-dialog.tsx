// apps/web/src/components/editor/common/new-document-dialog.tsx
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

const PRESETS = [
  { label: "Custom", width: 1920, height: 1080 },
  { label: "1920x1080 (HD)", width: 1920, height: 1080 },
  { label: "3840x2160 (4K)", width: 3840, height: 2160 },
  { label: "1080x1080 (Instagram)", width: 1080, height: 1080 },
  { label: "1200x628 (Facebook)", width: 1200, height: 628 },
  { label: "800x600", width: 800, height: 600 },
  { label: "1280x720", width: 1280, height: 720 },
];

const BACKGROUNDS = ["White", "Black", "Transparent"] as const;

interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewDocumentDialog({ open, onClose }: NewDocumentDialogProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [preset, setPreset] = useState("1920x1080 (HD)");
  const [background, setBackground] = useState<(typeof BACKGROUNDS)[number]>("White");
  const loadImage = useEditorStore((s) => s.loadImage);

  if (!open) return null;

  const backgroundLabels: Record<(typeof BACKGROUNDS)[number], string> = {
    White: t.editor.ui.newDocument.backgrounds.white,
    Black: t.editor.ui.newDocument.backgrounds.black,
    Transparent: t.editor.ui.newDocument.backgrounds.transparent,
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRESETS.find((p) => p.label === e.target.value);
    if (selected) {
      setPreset(selected.label);
      if (selected.label !== "Custom") {
        setWidth(selected.width);
        setHeight(selected.height);
      }
    }
  };

  const handleCreate = () => {
    const validWidth = Math.max(1, Math.min(10000, width));
    const validHeight = Math.max(1, Math.min(10000, height));
    const canvas = document.createElement("canvas");
    canvas.width = validWidth;
    canvas.height = validHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (background === "White") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, validWidth, validHeight);
      } else if (background === "Black") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, validWidth, validHeight);
      }
    }
    const url = canvas.toDataURL("image/png");
    loadImage(url, validWidth, validHeight);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t.editor.ui.newDocument.heading}
        </h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="new-doc-preset" className="text-xs text-muted-foreground">
              {t.editor.ui.newDocument.preset}
            </label>
            <select
              id="new-doc-preset"
              value={preset}
              onChange={handlePresetChange}
              className="w-full mt-1 px-2 py-1.5 bg-muted border border-border rounded text-sm text-foreground"
            >
              {PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="new-doc-width" className="text-xs text-muted-foreground">
                {t.editor.ui.widthPx}
              </label>
              <input
                id="new-doc-width"
                type="number"
                value={width}
                onChange={(e) => {
                  setWidth(Number(e.target.value));
                  setPreset("Custom");
                }}
                className="w-full mt-1 px-2 py-1.5 bg-muted border border-border rounded text-sm text-foreground"
                min={1}
                max={10000}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="new-doc-height" className="text-xs text-muted-foreground">
                {t.editor.ui.heightPx}
              </label>
              <input
                id="new-doc-height"
                type="number"
                value={height}
                onChange={(e) => {
                  setHeight(Number(e.target.value));
                  setPreset("Custom");
                }}
                className="w-full mt-1 px-2 py-1.5 bg-muted border border-border rounded text-sm text-foreground"
                min={1}
                max={10000}
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">
              {t.editor.ui.newDocument.background}
            </span>
            <div className="flex gap-2 mt-1">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setBackground(bg)}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded border transition-colors",
                    background === bg
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80",
                  )}
                >
                  {backgroundLabels[bg]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            {t.common.create}
          </button>
        </div>
      </div>
    </div>
  );
}
