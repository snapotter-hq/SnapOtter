import { Download, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { formatHeaders } from "@/lib/api";
import {
  COLLAGE_TEMPLATES,
  type CollageTemplate,
  getTemplateById,
  getTemplatesForCount,
} from "@/lib/collage-templates";
import { cn } from "@/lib/utils";
import { type AspectRatio, type OutputFormat, useCollageStore } from "@/stores/collage-store";

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:5", label: "4:5" },
];

const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
];

const BG_PRESETS = [
  { id: "white" as const, label: "White", color: "#FFFFFF", border: true },
  { id: "black" as const, label: "Black", color: "#000000", border: false },
  { id: "transparent" as const, label: "None", color: "transparent", border: true },
  { id: "custom" as const, label: "Custom", color: null, border: true },
];

export function CollageSettings() {
  const store = useCollageStore();
  const {
    images,
    templateId,
    cellAssignments,
    cellTransforms,
    gap,
    cornerRadius,
    backgroundColor,
    bgPreset,
    aspectRatio,
    outputFormat,
    quality,
    phase,
    resultUrl,
    resultSize,
    originalSize,
    error,
  } = store;

  const template = getTemplateById(templateId);
  const imageCount = images.length;
  const hasImages = imageCount > 0;

  const handleProcess = useCallback(async () => {
    if (!hasImages || !template) return;

    store.setPhase("processing");
    store.setError(null);

    try {
      const formData = new FormData();
      // Send images in cell-assignment order
      for (let i = 0; i < template.cells.length; i++) {
        const imgIdx = cellAssignments[i] ?? -1;
        if (imgIdx >= 0 && images[imgIdx]) {
          formData.append("file", images[imgIdx].file);
        }
      }

      const cells = template.cells.map((_, i) => {
        const t = cellTransforms[i] ?? { panX: 0, panY: 0, zoom: 1 };
        return { imageIndex: i, panX: t.panX, panY: t.panY, zoom: t.zoom };
      });

      formData.append(
        "settings",
        JSON.stringify({
          templateId,
          cells,
          gap,
          cornerRadius,
          backgroundColor,
          aspectRatio,
          outputFormat,
          quality,
        }),
      );

      const res = await fetch("/api/v1/tools/collage", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const result = await res.json();
      store.setResult(result.downloadUrl, result.processedSize, result.originalSize, result.jobId);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : "Collage failed");
    }
  }, [
    hasImages,
    template,
    store,
    cellAssignments,
    cellTransforms,
    images,
    templateId,
    gap,
    cornerRadius,
    backgroundColor,
    aspectRatio,
    outputFormat,
    quality,
  ]);

  // Group templates by image count, prioritizing current count
  const matchingTemplates = imageCount > 0 ? getTemplatesForCount(imageCount) : [];
  const allTemplates = COLLAGE_TEMPLATES;

  return (
    <div className="space-y-3">
      {/* Image count info */}
      {hasImages && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {imageCount} image{imageCount !== 1 ? "s" : ""} loaded
          </span>
          <button
            type="button"
            onClick={() => store.clearImages()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Layout templates */}
      <CollapsibleSection title="Layout" badge={template?.label} defaultOpen>
        <div className="space-y-2">
          {matchingTemplates.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                Best for {imageCount} images
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {matchingTemplates.map((t) => (
                  <TemplateButton
                    key={t.id}
                    template={t}
                    isSelected={templateId === t.id}
                    onClick={() => store.setTemplateId(t.id)}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            {matchingTemplates.length > 0 && (
              <p className="text-[10px] text-muted-foreground mb-1.5">All layouts</p>
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {allTemplates.map((t) => (
                <TemplateButton
                  key={t.id}
                  template={t}
                  isSelected={templateId === t.id}
                  onClick={() => store.setTemplateId(t.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Spacing & Style */}
      <CollapsibleSection title="Spacing & Style" defaultOpen>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Gap</span>
              <span className="text-xs font-mono text-foreground">{gap}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={gap}
              onChange={(e) => store.setGap(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Corner Radius</span>
              <span className="text-xs font-mono text-foreground">{cornerRadius}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={cornerRadius}
              onChange={(e) => store.setCornerRadius(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Background</span>
            <div className="flex items-center gap-1.5 mt-1">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => store.setBgPreset(p.id)}
                  className={cn(
                    "w-7 h-7 rounded-md transition-all",
                    bgPreset === p.id && "ring-2 ring-primary ring-offset-1",
                    p.border && "border border-border",
                  )}
                  style={{
                    background:
                      p.id === "transparent"
                        ? "repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%) 0 0 / 8px 8px"
                        : p.id === "custom"
                          ? backgroundColor
                          : (p.color ?? undefined),
                  }}
                  title={p.label}
                />
              ))}
              {bgPreset === "custom" && (
                <input
                  type="color"
                  value={backgroundColor === "transparent" ? "#FFFFFF" : backgroundColor}
                  onChange={(e) => store.setBackgroundColor(e.target.value)}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                />
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Canvas */}
      <CollapsibleSection title="Canvas" badge={aspectRatio === "free" ? undefined : aspectRatio}>
        <div>
          <span className="text-xs text-muted-foreground">Aspect Ratio</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                type="button"
                onClick={() => store.setAspectRatio(ar.value)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
                  aspectRatio === ar.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Output */}
      <CollapsibleSection title="Output" badge={outputFormat.toUpperCase()}>
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground">Format</span>
            <div className="flex gap-1 mt-1">
              {OUTPUT_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => store.setOutputFormat(f.value)}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded-md transition-colors",
                    outputFormat === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {outputFormat !== "png" && (
            <div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Quality</span>
                <span className="text-xs font-mono text-foreground">{quality}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => store.setQuality(Number(e.target.value))}
                className="w-full mt-1"
              />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Actions */}
      <button
        type="button"
        data-testid="collage-submit"
        onClick={handleProcess}
        disabled={!hasImages || phase === "processing"}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {phase === "processing" && <Loader2 className="h-4 w-4 animate-spin" />}
        {phase === "processing" ? "Creating..." : `Create Collage (${imageCount} images)`}
      </button>

      {resultUrl && (
        <a
          href={resultUrl}
          download
          data-testid="collage-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Collage
        </a>
      )}

      {/* Size info */}
      {originalSize != null && resultSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Input total: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Collage: {(resultSize / 1024).toFixed(1)} KB</p>
        </div>
      )}
    </div>
  );
}

/** Mini template thumbnail as an SVG diagram. */
function TemplateButton({
  template,
  isSelected,
  onClick,
}: {
  template: CollageTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 p-1 rounded-md border transition-all",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 bg-muted/30",
      )}
      title={`${template.label} (${template.imageCount} images)`}
    >
      <TemplateDiagram template={template} size={40} />
      <span className="text-[9px] text-muted-foreground leading-tight">{template.imageCount}</span>
    </button>
  );
}

/** Renders a mini SVG preview of a template layout. */
function TemplateDiagram({ template, size }: { template: CollageTemplate; size: number }) {
  const padding = 2;
  const gap = 1.5;
  const inner = size - padding * 2;

  // Parse the CSS grid template to compute cell rects
  const rects = computeCellRects(template, inner, gap);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={template.label}
    >
      {rects.map((r, i) => (
        <rect
          key={`${template.id}-${i}`}
          x={padding + r.x}
          y={padding + r.y}
          width={r.w}
          height={r.h}
          rx={1}
          className="fill-current text-muted-foreground/40"
        />
      ))}
    </svg>
  );
}

/** Parse CSS grid definitions into pixel rects for the SVG diagram. */
function computeCellRects(
  template: CollageTemplate,
  size: number,
  gap: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const cols = parseFrValues(template.gridTemplateColumns);
  const rows = parseFrValues(template.gridTemplateRows);

  const totalColGaps = (cols.length - 1) * gap;
  const totalRowGaps = (rows.length - 1) * gap;
  const availW = size - totalColGaps;
  const availH = size - totalRowGaps;

  const colFrTotal = cols.reduce((s, v) => s + v, 0);
  const rowFrTotal = rows.reduce((s, v) => s + v, 0);

  const colWidths = cols.map((fr) => (fr / colFrTotal) * availW);
  const rowHeights = rows.map((fr) => (fr / rowFrTotal) * availH);

  // Compute cumulative positions
  const colStarts: number[] = [0];
  for (let i = 1; i < cols.length; i++) {
    colStarts.push(colStarts[i - 1] + colWidths[i - 1] + gap);
  }
  const rowStarts: number[] = [0];
  for (let i = 1; i < rows.length; i++) {
    rowStarts.push(rowStarts[i - 1] + rowHeights[i - 1] + gap);
  }

  return template.cells.map((cell) => {
    const [colStart, colEnd] = parseGridRange(cell.gridColumn, cols.length);
    const [rowStart, rowEnd] = parseGridRange(cell.gridRow, rows.length);

    const x = colStarts[colStart];
    const y = rowStarts[rowStart];
    const w = colStarts[colEnd - 1] + colWidths[colEnd - 1] - colStarts[colStart];
    const h = rowStarts[rowEnd - 1] + rowHeights[rowEnd - 1] - rowStarts[rowStart];

    return { x, y, w, h };
  });
}

/** Parse "1fr 2fr 1fr" into [1, 2, 1]. */
function parseFrValues(template: string): number[] {
  return template
    .trim()
    .split(/\s+/)
    .map((s) => {
      const match = s.match(/^(\d+(?:\.\d+)?)fr$/);
      return match ? Number(match[1]) : 1;
    });
}

/** Parse CSS grid-column/grid-row value like "1 / 3" or "2" into [startIndex, endIndex]. */
function parseGridRange(value: string, trackCount: number): [number, number] {
  const parts = value.split("/").map((s) => s.trim());
  const start = Number(parts[0]) - 1; // CSS grid lines are 1-based
  const end = parts.length > 1 ? Number(parts[1]) - 1 : start + 1;
  return [Math.max(0, start), Math.min(trackCount, end)];
}
