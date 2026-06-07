import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import {
  FONT_OPTIONS,
  PRESET_LAYOUTS,
  type TemplateTextBox,
  useMemeStore,
} from "@/stores/meme-store";

const INPUT_CLASS =
  "w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

// ── Gallery Phase Settings ──────────────────────────────────────────

function GallerySettings() {
  return (
    <div className="space-y-3">
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">
          Select a template from the gallery or upload your own image to get started.
        </p>
      </div>
    </div>
  );
}

// ── Layout Picker Phase Settings ────────────────────────────────────

function LayoutPickerSettings() {
  return (
    <div className="space-y-3">
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">Choose a text layout for your custom image.</p>
      </div>
    </div>
  );
}

// ── Editor Phase Settings ───────────────────────────────────────────

function EditorSettings() {
  const selectedTemplate = useMemeStore((s) => s.selectedTemplate);
  const customLayout = useMemeStore((s) => s.customLayout);
  const textBoxValues = useMemeStore((s) => s.textBoxValues);
  const fontFamily = useMemeStore((s) => s.fontFamily);
  const fontSize = useMemeStore((s) => s.fontSize);
  const textColor = useMemeStore((s) => s.textColor);
  const strokeColor = useMemeStore((s) => s.strokeColor);
  const textAlign = useMemeStore((s) => s.textAlign);
  const allCaps = useMemeStore((s) => s.allCaps);
  const generating = useMemeStore((s) => s.generating);
  const error = useMemeStore((s) => s.error);
  const updateTextValue = useMemeStore((s) => s.updateTextValue);
  const setFontFamily = useMemeStore((s) => s.setFontFamily);
  const setFontSize = useMemeStore((s) => s.setFontSize);
  const setTextColor = useMemeStore((s) => s.setTextColor);
  const setStrokeColor = useMemeStore((s) => s.setStrokeColor);
  const setTextAlign = useMemeStore((s) => s.setTextAlign);
  const setAllCaps = useMemeStore((s) => s.setAllCaps);
  const generateMeme = useMemeStore((s) => s.generateMeme);
  const backToGallery = useMemeStore((s) => s.backToGallery);

  const textBoxes: TemplateTextBox[] = selectedTemplate
    ? selectedTemplate.textBoxes
    : ((customLayout && PRESET_LAYOUTS[customLayout]?.boxes) ?? PRESET_LAYOUTS["top-bottom"].boxes);

  const handleGenerate = useCallback(() => {
    generateMeme();
  }, [generateMeme]);

  return (
    <div className="space-y-3">
      {/* Back button */}
      <button
        type="button"
        data-testid="back-to-gallery"
        onClick={backToGallery}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to templates
      </button>

      {/* Template name */}
      {selectedTemplate && (
        <p className="text-xs font-medium text-foreground truncate">{selectedTemplate.name}</p>
      )}

      {/* Text inputs */}
      {textBoxes.map((box) => {
        const val = textBoxValues.find((v) => v.id === box.id);
        return (
          <div key={box.id}>
            <label
              htmlFor={`text-${box.id}`}
              className="text-xs text-muted-foreground capitalize block mb-0.5"
            >
              {box.defaultText || box.id}
            </label>
            <input
              id={`text-${box.id}`}
              data-testid={`text-input-${box.id}`}
              type="text"
              value={val?.text ?? ""}
              onChange={(e) => updateTextValue(box.id, e.target.value)}
              placeholder={box.defaultText || box.id}
              className={INPUT_CLASS}
            />
          </div>
        );
      })}

      {/* Font picker */}
      <div>
        <label htmlFor="font-picker" className="text-xs text-muted-foreground block mb-0.5">
          Font
        </label>
        <select
          id="font-picker"
          data-testid="font-picker"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className={INPUT_CLASS}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div>
        <div className="flex justify-between items-center mb-0.5">
          <label htmlFor="font-size" className="text-xs text-muted-foreground">
            Font Size
          </label>
          <span className="text-xs font-mono text-foreground">
            {fontSize === 0 ? "Auto" : `${fontSize}px`}
          </span>
        </div>
        <input
          id="font-size"
          data-testid="font-size-slider"
          type="range"
          min={0}
          max={200}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Colors */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label htmlFor="text-color" className="text-xs text-muted-foreground block mb-0.5">
            Text
          </label>
          <div className="flex items-center gap-1">
            <input
              id="text-color"
              data-testid="text-color"
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-7 h-7 rounded border border-border shrink-0 cursor-pointer"
            />
            <input
              type="text"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="flex-1 min-w-0 px-1 py-1 rounded border border-border bg-background text-[11px] text-foreground font-mono"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <label htmlFor="stroke-color" className="text-xs text-muted-foreground block mb-0.5">
            Stroke
          </label>
          <div className="flex items-center gap-1">
            <input
              id="stroke-color"
              data-testid="stroke-color"
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="w-7 h-7 rounded border border-border shrink-0 cursor-pointer"
            />
            <input
              type="text"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="flex-1 min-w-0 px-1 py-1 rounded border border-border bg-background text-[11px] text-foreground font-mono"
            />
          </div>
        </div>
      </div>

      {/* Alignment */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Alignment</span>
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => {
            const Icon =
              align === "left" ? AlignLeft : align === "right" ? AlignRight : AlignCenter;
            return (
              <button
                key={align}
                type="button"
                data-testid={`align-${align}`}
                onClick={() => setTextAlign(align)}
                className={cn(
                  "flex-1 py-1.5 rounded flex items-center justify-center transition-colors",
                  textAlign === align
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* All caps */}
      <label
        className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
        data-testid="all-caps"
      >
        <input
          type="checkbox"
          checked={allCaps}
          onChange={(e) => setAllCaps(e.target.checked)}
          className="rounded border-border"
        />
        ALL CAPS
      </label>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* Generate */}
      <button
        type="button"
        data-testid="generate-meme"
        onClick={handleGenerate}
        disabled={generating}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Meme
          </>
        )}
      </button>
    </div>
  );
}

// ── Result Phase Settings ───────────────────────────────────────────

function ResultSettings() {
  const resultUrl = useMemeStore((s) => s.resultUrl);
  const backToEditor = useMemeStore((s) => s.backToEditor);
  const backToGallery = useMemeStore((s) => s.backToGallery);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Your meme is ready.</p>

      {resultUrl && (
        <a
          href={resultUrl}
          download
          data-testid="sidebar-download-meme"
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download Meme
        </a>
      )}

      <button
        type="button"
        data-testid="sidebar-edit-meme"
        onClick={backToEditor}
        className="w-full py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
      >
        Edit Again
      </button>

      <button
        type="button"
        data-testid="sidebar-new-meme"
        onClick={backToGallery}
        className="w-full py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
      >
        New Meme
      </button>
    </div>
  );
}

// ── Main Settings Component ─────────────────────────────────────────

export function MemeGeneratorSettings() {
  const { t } = useTranslation();
  const phase = useMemeStore((s) => s.phase);

  if (phase === "gallery") return <GallerySettings />;
  if (phase === "layout-picker") return <LayoutPickerSettings />;
  if (phase === "editor") return <EditorSettings />;
  if (phase === "result") return <ResultSettings />;

  return null;
}
