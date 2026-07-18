import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const TARGET_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "custom", label: "Custom" },
] as const;

/** Mirror of the backend canvasFor helper for preview geometry. */
function canvasFor(w: number, h: number, target: string): { cw: number; ch: number } {
  const [tw, th] = target.split(":").map(Number);
  const ratio = tw / th;
  const src = w / h;
  if (src > ratio) return { cw: w, ch: Math.round(w / ratio) };
  return { cw: Math.round(h * ratio), ch: h };
}

interface ImagePadSettingsProps {
  onImageStyle?: (style: React.CSSProperties | null) => void;
  onImageOverlay?: (node: React.ReactNode) => void;
}

export function ImagePadSettings({ onImageStyle, onImageOverlay }: ImagePadSettingsProps) {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const blobUrl = entry?.blobUrl;
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("image-pad");

  const [target, setTarget] = useState("1:1");
  const [ratioW, setRatioW] = useState(1);
  const [ratioH, setRatioH] = useState(1);
  const [background, setBackground] = useState<"color" | "transparent" | "blur">("color");
  const [color, setColor] = useState("#ffffff");
  const [padding, setPadding] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // Natural image dimensions
  useEffect(() => {
    if (!blobUrl) {
      setDims(null);
      return;
    }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = blobUrl;
  }, [blobUrl]);

  // Stable refs for preview callbacks to avoid stale closures
  const onImageStyleRef = useRef(onImageStyle);
  useEffect(() => {
    onImageStyleRef.current = onImageStyle;
  });
  const onImageOverlayRef = useRef(onImageOverlay);
  useEffect(() => {
    onImageOverlayRef.current = onImageOverlay;
  });

  // Live preview: padded-canvas overlay covering the pane image.
  // onImageStyle({}) activates the wrapper branch in image-viewer
  // so onImageOverlay children actually mount.
  useEffect(() => {
    if (!blobUrl || !dims) return;

    onImageStyleRef.current?.({});

    const w = dims.w;
    const h = dims.h;
    const ratioStr = target === "custom" ? `${ratioW}:${ratioH}` : target;
    const { cw, ch } = canvasFor(w, h, ratioStr);
    const margin = padding > 0 ? Math.round((Math.max(cw, ch) * padding) / 100) : 0;
    const finalW = cw + margin * 2;
    const finalH = ch + margin * 2;

    // Fit the canvas (which may have a different AR) inside the overlay
    // (which has the source image AR).
    const canvasAR = finalW / finalH;
    const overlayAR = w / h;
    const [canvasWPct, canvasHPct] =
      canvasAR > overlayAR
        ? [100, (overlayAR / canvasAR) * 100]
        : [(canvasAR / overlayAR) * 100, 100];

    // Image positioning within the canvas
    const imgWPct = (w / finalW) * 100;
    const imgHPct = (h / finalH) * 100;
    const imgLeftPct = ((finalW - w) / (2 * finalW)) * 100;
    const imgTopPct = ((finalH - h) / (2 * finalH)) * 100;

    const checkerStyle: React.CSSProperties = {
      backgroundImage:
        "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
      backgroundSize: "16px 16px",
      backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
      backgroundColor: "#fff",
    };

    const bgStyle: React.CSSProperties =
      background === "transparent"
        ? checkerStyle
        : background === "color"
          ? { backgroundColor: color }
          : {};

    onImageOverlayRef.current?.(
      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
        <div
          className="relative overflow-hidden"
          style={{ width: `${canvasWPct}%`, height: `${canvasHPct}%`, ...bgStyle }}
        >
          {background === "blur" && (
            <img
              src={blobUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full select-none"
              style={{ objectFit: "cover", filter: "blur(20px)", transform: "scale(1.1)" }}
            />
          )}
          <img
            src={blobUrl}
            alt=""
            draggable={false}
            className="absolute select-none"
            style={{
              width: `${imgWPct}%`,
              height: `${imgHPct}%`,
              left: `${imgLeftPct}%`,
              top: `${imgTopPct}%`,
            }}
          />
        </div>
      </div>,
    );

    return () => {
      onImageStyleRef.current?.(null);
      onImageOverlayRef.current?.(null);
    };
  }, [blobUrl, dims, target, ratioW, ratioH, background, color, padding]);

  const handleProcess = () => {
    const settings = { target, ratioW, ratioH, background, color, padding };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const canProcess = hasFile && !processing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProcess) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Aspect Ratio */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">{t.toolSettings["image-pad"].target}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTarget(opt.value)}
              className={`text-xs py-1.5 rounded transition-colors ${
                target === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {target === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              min={1}
              max={100}
              value={ratioW}
              onChange={(e) => setRatioW(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-foreground text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-muted-foreground">:</span>
            <input
              type="number"
              min={1}
              max={100}
              value={ratioH}
              onChange={(e) => setRatioH(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-foreground text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        )}
      </div>

      {/* Background Type */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Background</p>
        <div className="flex gap-1">
          {(["color", "transparent", "blur"] as const).map((bg) => (
            <button
              key={bg}
              type="button"
              onClick={() => setBackground(bg)}
              className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                background === bg
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {bg === "color" ? "Color" : bg === "transparent" ? "Transparent" : "Blur"}
            </button>
          ))}
        </div>
      </div>

      {/* Color Picker (only for "color" background) */}
      {background === "color" && (
        <div>
          <label htmlFor="image-pad-color" className="text-xs text-muted-foreground">
            {t.toolSettings["image-pad"].color}
          </label>
          <div className="flex items-center gap-2 mt-0.5">
            <input
              id="image-pad-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded border border-border shrink-0"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
            />
          </div>
        </div>
      )}

      {/* Padding Slider */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Padding</span>
          <span className="text-xs font-mono text-foreground tabular-nums">{padding}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          value={padding}
          onChange={(e) => setPadding(Number(e.target.value))}
          className="w-full mt-0.5"
        />
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["image-pad"].progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="image-pad-submit"
          disabled={!canProcess}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? t.toolSettings["image-pad"].submitBatch.replace("{count}", String(files.length))
            : t.toolSettings["image-pad"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="image-pad-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
