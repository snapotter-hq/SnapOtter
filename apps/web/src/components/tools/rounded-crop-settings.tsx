import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const PREVIEW_D = 200; // crop box side in the inline preview, px
type Shape = "rounded-square" | "squircle";

// CSS clip-path polygon tracing the same superellipse the backend renders,
// so the squircle preview matches the output. Kept module-level: it never
// changes, so there's nothing to recompute per render.
const SQUIRCLE_CLIP = (() => {
  const n = 4;
  const exp = 2 / n;
  const pts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = 50 + 50 * Math.sign(c) * Math.abs(c) ** exp;
    const y = 50 + 50 * Math.sign(s) * Math.abs(s) ** exp;
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(",")})`;
})();

export function RoundedCropSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const blobUrl = entry?.blobUrl;
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("rounded-crop");

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [shape, setShape] = useState<Shape>("rounded-square");
  const [cornerRadius, setCornerRadius] = useState(25);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0.5);
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [bgMode, setBgMode] = useState<"transparent" | "color">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [outputSize, setOutputSize] = useState("");

  // Natural image dimensions, for accurate framing math.
  useEffect(() => {
    if (!blobUrl) {
      setDims(null);
      return;
    }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = blobUrl;
  }, [blobUrl]);

  // Preview geometry (mirrors the backend region math).
  const W = dims?.w ?? 1;
  const H = dims?.h ?? 1;
  const d = Math.max(1, Math.min(W, H) / zoom);
  const scale = PREVIEW_D / d;
  const left = (W - d) * offsetX;
  const top = (H - d) * offsetY;
  const bwPx = borderWidth * scale;
  // Corner radius in preview px, capped at half (a full round = circle).
  const innerRadius = Math.min((cornerRadius / 100) * PREVIEW_D, PREVIEW_D / 2);

  // Shape styling for the inner crop box and outer border ring.
  const innerShape = useMemo(
    () =>
      shape === "squircle" ? { clipPath: SQUIRCLE_CLIP } : { borderRadius: `${innerRadius}px` },
    [shape, innerRadius],
  );
  const outerShape =
    shape === "squircle"
      ? { clipPath: SQUIRCLE_CLIP }
      : { borderRadius: `${innerRadius + bwPx}px` };

  // Drag-to-pan the crop box.
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!dims) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offsetX, oy: offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !dims) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    const rangeX = W - d;
    const rangeY = H - d;
    if (rangeX > 0) {
      const nl = Math.min(Math.max(drag.current.ox * rangeX - dx / scale, 0), rangeX);
      setOffsetX(nl / rangeX);
    }
    if (rangeY > 0) {
      const nt = Math.min(Math.max(drag.current.oy * rangeY - dy / scale, 0), rangeY);
      setOffsetY(nt / rangeY);
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const handleProcess = () => {
    const settings: Record<string, unknown> = {
      shape,
      cornerRadius,
      zoom,
      offsetX,
      offsetY,
      borderWidth,
      borderColor,
      background: bgMode === "transparent" ? "transparent" : bgColor,
    };
    const sz = Number.parseInt(outputSize, 10);
    if (!Number.isNaN(sz) && sz >= 16) settings.outputSize = sz;
    if (files.length > 1) processAllFiles(files, settings);
    else processFiles(files, settings);
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Live framing preview */}
      {hasFile && blobUrl && (
        <div className="flex justify-center">
          <div
            className="relative"
            style={{
              width: PREVIEW_D + bwPx * 2,
              height: PREVIEW_D + bwPx * 2,
              padding: bwPx,
              background: bwPx > 0 ? borderColor : "transparent",
              ...outerShape,
            }}
          >
            <div
              className="relative overflow-hidden touch-none cursor-grab active:cursor-grabbing"
              style={{
                width: PREVIEW_D,
                height: PREVIEW_D,
                background: bgMode === "color" ? bgColor : "transparent",
                ...innerShape,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* checkerboard hint for transparency */}
              {bgMode === "transparent" && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                  }}
                />
              )}
              <img
                src={blobUrl}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{
                  width: W * scale,
                  height: H * scale,
                  left: -left * scale,
                  top: -top * scale,
                }}
              />
            </div>
          </div>
        </div>
      )}
      {hasFile && (
        <p className="text-center text-[10px] text-muted-foreground">
          Drag the preview to reposition
        </p>
      )}

      {/* Shape */}
      <div>
        <span className="text-xs text-muted-foreground">Shape</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setShape("rounded-square")}
            className={`flex-1 text-xs py-1.5 rounded ${shape === "rounded-square" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Rounded square
          </button>
          <button
            type="button"
            onClick={() => setShape("squircle")}
            className={`flex-1 text-xs py-1.5 rounded ${shape === "squircle" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Squircle
          </button>
        </div>
      </div>

      {/* Corner radius (rounded square only) */}
      {shape === "rounded-square" && (
        <div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Corner radius</span>
            <span className="text-xs font-mono text-foreground">{cornerRadius}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            value={cornerRadius}
            onChange={(e) => setCornerRadius(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {/* Zoom */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <span className="text-xs font-mono text-foreground">{zoom.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Border */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Border</span>
          <span className="text-xs font-mono text-foreground">{borderWidth}px</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={0}
            max={100}
            value={borderWidth}
            onChange={(e) => setBorderWidth(Number(e.target.value))}
            className="flex-1 min-w-0"
          />
          <input
            type="color"
            value={borderColor}
            onChange={(e) => setBorderColor(e.target.value)}
            aria-label="Border color"
            className="h-7 w-9 shrink-0 rounded border border-border bg-background"
          />
        </div>
      </div>

      {/* Background */}
      <div>
        <span className="text-xs text-muted-foreground">Background</span>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex flex-1 gap-1">
            <button
              type="button"
              onClick={() => setBgMode("transparent")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "transparent" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Transparent
            </button>
            <button
              type="button"
              onClick={() => setBgMode("color")}
              className={`flex-1 text-xs py-1.5 rounded ${bgMode === "color" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Color
            </button>
          </div>
          {bgMode === "color" && (
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              aria-label="Background color"
              className="h-7 w-9 shrink-0 rounded border border-border bg-background"
            />
          )}
        </div>
      </div>

      {/* Output size */}
      <div>
        <label htmlFor="rc-output-size" className="text-xs text-muted-foreground">
          Output size (px)
        </label>
        <input
          id="rc-output-size"
          type="number"
          min={16}
          value={outputSize}
          onChange={(e) => setOutputSize(e.target.value)}
          placeholder="Original"
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["rounded-crop"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="rounded-crop-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {files.length > 1
            ? t.toolSettings["rounded-crop"].submitBatch.replace("{count}", String(files.length))
            : t.toolSettings["rounded-crop"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="rounded-crop-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </div>
  );
}
