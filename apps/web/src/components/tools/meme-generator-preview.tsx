import {
  ArrowLeft,
  Download,
  ImagePlus,
  Laugh,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  FONT_FAMILY_MAP,
  injectMemeFonts,
  PRESET_LAYOUTS,
  type TemplateTextBox,
  type TextBoxValue,
  type TextLayout,
  useMemeStore,
} from "@/stores/meme-store";

const INPUT_CLASS =
  "w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

// ── Text Preview Overlay ────────────────────────────────────────────

function TextPreviewOverlay({
  boxes,
  textValues,
  fontFamily,
  fontSize,
  textColor,
  strokeColor,
  textAlign,
  allCaps,
  containerWidth,
}: {
  boxes: TemplateTextBox[];
  textValues: TextBoxValue[];
  fontFamily: string;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  textAlign: string;
  allCaps: boolean;
  containerWidth: number;
}) {
  const cssFontFamily = FONT_FAMILY_MAP[fontFamily] ?? FONT_FAMILY_MAP.anton;

  return (
    <>
      {boxes.map((box) => {
        const value = textValues.find((v) => v.id === box.id);
        const text = value?.text || box.defaultText || "";
        const displayText = allCaps ? text.toUpperCase() : text;
        const boxPxW = (box.width / 100) * containerWidth;
        const boxPxH = (box.height / 100) * containerWidth;
        const autoSize = Math.max(10, Math.min(Math.floor(boxPxW / 8), Math.floor(boxPxH / 2), 48));
        const appliedSize = fontSize > 0 ? fontSize : autoSize;
        const stroke = Math.max(1, Math.round(appliedSize * 0.04));

        return (
          <div
            key={box.id}
            data-testid={`preview-box-${box.id}`}
            className="absolute flex items-center overflow-hidden pointer-events-none"
            style={{
              top: `${box.y}%`,
              left: `${box.x}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              justifyContent:
                textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
            }}
          >
            <span
              className="w-full leading-tight break-words whitespace-pre-wrap"
              style={{
                fontFamily: cssFontFamily,
                fontSize: `${appliedSize}px`,
                color: textColor,
                textAlign: textAlign as "left" | "center" | "right",
                WebkitTextStroke: `${stroke}px ${strokeColor}`,
                paintOrder: "stroke fill",
                textShadow: `1px 1px 2px rgba(0,0,0,0.5)`,
              }}
            >
              {displayText}
            </span>
          </div>
        );
      })}
    </>
  );
}

// ── Gallery Phase ───────────────────────────────────────────────────

function TemplateGallery() {
  const templates = useMemeStore((s) => s.templates);
  const searchQuery = useMemeStore((s) => s.searchQuery);
  const activeCategory = useMemeStore((s) => s.activeCategory);
  const selectTemplate = useMemeStore((s) => s.selectTemplate);
  const setSearchQuery = useMemeStore((s) => s.setSearchQuery);
  const setActiveCategory = useMemeStore((s) => s.setActiveCategory);
  const setCustomImage = useMemeStore((s) => s.setCustomImage);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let result = templates;

    if (activeCategory !== "all") {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.aliases.some((a) => a.toLowerCase().includes(q)) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [templates, searchQuery, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length };
    for (const t of templates) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const handleUploadCustom = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCustomImage(file);
      e.target.value = "";
    },
    [setCustomImage],
  );

  return (
    <div data-testid="meme-gallery" className="h-full overflow-auto p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            data-testid="template-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className={cn(INPUT_CLASS, "ps-8")}
          />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              data-testid={`category-${cat.id}`}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs transition-colors",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {cat.label}
              <span className="ms-1 opacity-70">({categoryCounts[cat.id] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Upload custom */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.avif,.heic,.heif,.hif"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          data-testid="upload-custom"
          onClick={handleUploadCustom}
          className="w-full max-w-md py-3 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-2"
        >
          <ImagePlus className="h-4 w-4" />
          Upload Custom Image
        </button>

        {/* Template grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`template-${t.id}`}
              onClick={() => selectTemplate(t)}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/60 transition-all hover:shadow-md"
            >
              <img
                src={`/api/v1/meme-templates/thumbs/${t.filename.replace(/\.[^.]+$/, ".webp")}`}
                alt={t.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4">
                <span className="text-[10px] text-white font-medium leading-tight line-clamp-2">
                  {t.name}
                </span>
              </div>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Laugh className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No templates match your search
          </div>
        )}
      </div>
    </div>
  );
}

// ── Layout Picker Phase (custom image) ──────────────────────────────

function LayoutPicker() {
  const customImageUrl = useMemeStore((s) => s.customImageUrl);
  const customLayout = useMemeStore((s) => s.customLayout);
  const setCustomLayout = useMemeStore((s) => s.setCustomLayout);
  const backToGallery = useMemeStore((s) => s.backToGallery);

  const selected = customLayout ?? "top-bottom";

  if (!customImageUrl) return null;

  return (
    <div
      data-testid="layout-picker"
      className="h-full overflow-auto p-4 flex items-center justify-center"
    >
      <div className="max-w-xl w-full space-y-4">
        <button
          type="button"
          onClick={backToGallery}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to templates
        </button>

        <p className="text-sm text-foreground font-medium">Choose a text layout</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(
            Object.entries(PRESET_LAYOUTS) as [TextLayout, (typeof PRESET_LAYOUTS)[TextLayout]][]
          ).map(([key, layout]) => (
            <button
              key={key}
              type="button"
              data-testid={`layout-${key}`}
              onClick={() => setCustomLayout(key)}
              className={cn(
                "relative rounded-lg border-2 p-3 transition-all text-start",
                selected === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              {/* Mini preview */}
              <div className="relative aspect-video rounded bg-muted/50 overflow-hidden mb-2">
                <img
                  src={customImageUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-50"
                />
                {layout.boxes.map((box) => (
                  <div
                    key={box.id}
                    className="absolute bg-primary/30 border border-primary/50 rounded-sm"
                    style={{
                      top: `${box.y}%`,
                      left: `${box.x}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-foreground">{layout.label}</span>
              <span className="block text-[10px] text-muted-foreground">{layout.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Editor Phase ────────────────────────────────────────────────────

function EditorPreview() {
  const selectedTemplate = useMemeStore((s) => s.selectedTemplate);
  const customImageUrl = useMemeStore((s) => s.customImageUrl);
  const customLayout = useMemeStore((s) => s.customLayout);
  const textBoxValues = useMemeStore((s) => s.textBoxValues);
  const fontFamily = useMemeStore((s) => s.fontFamily);
  const fontSize = useMemeStore((s) => s.fontSize);
  const textColor = useMemeStore((s) => s.textColor);
  const strokeColor = useMemeStore((s) => s.strokeColor);
  const textAlign = useMemeStore((s) => s.textAlign);
  const allCaps = useMemeStore((s) => s.allCaps);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imageSrc = selectedTemplate
    ? `/api/v1/meme-templates/full/${selectedTemplate.filename}`
    : (customImageUrl ?? "");

  const textBoxes = selectedTemplate
    ? selectedTemplate.textBoxes
    : ((customLayout && PRESET_LAYOUTS[customLayout]?.boxes) ?? PRESET_LAYOUTS["top-bottom"].boxes);

  return (
    <div className="h-full flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-2xl w-full">
        <div
          ref={containerRef}
          data-testid="meme-editor-preview"
          className="relative w-full rounded-lg overflow-hidden border border-border bg-muted/30"
        >
          <img src={imageSrc} alt="Template preview" className="w-full h-auto block" />
          <TextPreviewOverlay
            boxes={textBoxes}
            textValues={textBoxValues}
            fontFamily={fontFamily}
            fontSize={fontSize}
            textColor={textColor}
            strokeColor={strokeColor}
            textAlign={textAlign}
            allCaps={allCaps}
            containerWidth={containerWidth}
          />
        </div>
      </div>
    </div>
  );
}

// ── Result Phase ────────────────────────────────────────────────────

function ResultView() {
  const resultUrl = useMemeStore((s) => s.resultUrl);
  const backToEditor = useMemeStore((s) => s.backToEditor);
  const backToGallery = useMemeStore((s) => s.backToGallery);

  if (!resultUrl) return null;

  return (
    <div data-testid="meme-result" className="flex flex-col h-full w-full">
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <img
          src={resultUrl}
          alt="Generated meme"
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        />
      </div>
      <div className="shrink-0 border-t border-border bg-background px-4 py-3 flex items-center justify-center gap-3">
        <button
          type="button"
          data-testid="edit-meme"
          onClick={backToEditor}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Back to editor
        </button>
        <a
          href={resultUrl}
          download
          data-testid="download-meme"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
        <button
          type="button"
          data-testid="new-meme"
          onClick={backToGallery}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          New Meme
        </button>
      </div>
    </div>
  );
}

// ── Loading / Error States ──────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex items-center justify-center h-full gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading templates...</span>
    </div>
  );
}

function ErrorView() {
  const error = useMemeStore((s) => s.error);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center py-16">
        <p className="text-sm text-destructive mb-2">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-xs text-primary-ink hover:underline"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Main Preview Component (ResultsPanel) ───────────────────────────

export function MemeGeneratorPreview() {
  const phase = useMemeStore((s) => s.phase);
  const loading = useMemeStore((s) => s.loading);
  const error = useMemeStore((s) => s.error);
  const templates = useMemeStore((s) => s.templates);
  const fetchTemplates = useMemeStore((s) => s.fetchTemplates);

  // Inject fonts on mount
  useEffect(() => {
    injectMemeFonts();
  }, []);

  // Fetch templates on mount
  useEffect(() => {
    if (templates.length === 0) {
      fetchTemplates();
    }
  }, [templates.length, fetchTemplates]);

  if (loading && templates.length === 0) {
    return <LoadingView />;
  }

  if (error && phase === "gallery") {
    return <ErrorView />;
  }

  if (phase === "gallery") {
    return <TemplateGallery />;
  }

  if (phase === "layout-picker") {
    return <LayoutPicker />;
  }

  if (phase === "editor") {
    return <EditorPreview />;
  }

  if (phase === "result") {
    return <ResultView />;
  }

  return null;
}
