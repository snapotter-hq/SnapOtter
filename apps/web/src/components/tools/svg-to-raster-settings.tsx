import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type OutputFormat = "png" | "jpg" | "webp" | "avif" | "tiff" | "gif" | "heif" | "jxl";
type SizingMode = "scale" | "custom";
type BgMode = "transparent" | "color";

const FORMATS: OutputFormat[] = ["png", "jpg", "webp", "avif", "tiff", "gif", "heif", "jxl"];
const LOSSY_FORMATS: OutputFormat[] = ["jpg", "webp", "avif", "heif", "jxl"];
const NO_TRANSPARENCY_FORMATS: OutputFormat[] = ["jpg", "tiff"];

const SCALE_PRESETS = [0.5, 1, 2, 3, 4];
const DPI_PRESETS = [72, 96, 150, 300];

interface SvgDims {
  width: number;
  height: number;
}

function parseSvgDimensions(file: File): Promise<SvgDims | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const vbMatch = text.match(
        /viewBox=["'][\s]*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)[\s]*["']/,
      );
      if (vbMatch) {
        const w = parseFloat(vbMatch[3]);
        const h = parseFloat(vbMatch[4]);
        if (w > 0 && h > 0) return resolve({ width: Math.round(w), height: Math.round(h) });
      }
      const wMatch = text.match(/\bwidth=["']([0-9.]+)/);
      const hMatch = text.match(/\bheight=["']([0-9.]+)/);
      if (wMatch && hMatch) {
        const w = parseFloat(wMatch[1]);
        const h = parseFloat(hMatch[1]);
        if (w > 0 && h > 0) return resolve({ width: Math.round(w), height: Math.round(h) });
      }
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

export function SvgToRasterSettings() {
  const { t } = useTranslation();
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, progress } =
    useToolProcessor("svg-to-raster");

  // SVG intrinsic dimensions
  const [svgDims, setSvgDims] = useState<SvgDims | null>(null);

  // Sizing
  const [sizingMode, setSizingMode] = useState<SizingMode>("scale");
  const [scale, setScale] = useState(1);
  const [customWidth, setCustomWidth] = useState(1024);
  const [customHeight, setCustomHeight] = useState("");

  // Render
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(90);

  // Background
  const [bgMode, setBgMode] = useState<BgMode>("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");

  const isLossy = LOSSY_FORMATS.includes(format);
  const hasFile = files.length > 0;

  // Parse SVG dimensions when file changes
  useEffect(() => {
    if (files.length === 0) {
      setSvgDims(null);
      return;
    }
    parseSvgDimensions(files[0]).then((dims) => {
      setSvgDims(dims);
      if (!dims) setSizingMode("custom");
    });
  }, [files]);

  // When format changes to one that does not support transparency, switch bgMode
  useEffect(() => {
    if (NO_TRANSPARENCY_FORMATS.includes(format) && bgMode === "transparent") {
      setBgMode("color");
    }
  }, [format, bgMode]);

  const computedWidth = svgDims ? Math.round(svgDims.width * scale) : null;
  const computedHeight = svgDims ? Math.round(svgDims.height * scale) : null;

  const handleProcess = () => {
    const settings: Record<string, unknown> = {
      dpi,
      quality,
      outputFormat: format,
      backgroundColor: bgMode === "transparent" ? "#00000000" : bgColor,
    };

    if (sizingMode === "scale" && computedWidth && computedHeight) {
      settings.width = computedWidth;
      settings.height = computedHeight;
    } else if (sizingMode === "custom") {
      settings.width = customWidth;
      if (customHeight) settings.height = Number(customHeight);
    }

    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const btnClass = (active: boolean) =>
    `text-xs py-1.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  return (
    <div className="space-y-4">
      {/* SVG Info */}
      {hasFile && svgDims && (
        <div>
          <p className="text-xs text-muted-foreground">SVG Dimensions</p>
          <div className="mt-1 px-2 py-1.5 rounded bg-muted text-sm text-foreground font-mono">
            {svgDims.width} x {svgDims.height}
            {sizingMode === "scale" && computedWidth && computedHeight && (
              <span className="text-muted-foreground">
                {" "}
                &rarr; {computedWidth} x {computedHeight}
              </span>
            )}
          </div>
        </div>
      )}

      {hasFile && !svgDims && (
        <div>
          <p className="text-xs text-muted-foreground">SVG Dimensions</p>
          <div className="mt-1 px-2 py-1.5 rounded bg-muted text-xs text-muted-foreground">
            Could not detect dimensions. Using custom size.
          </div>
        </div>
      )}

      <div className="border-t border-border" />

      {/* Sizing Mode */}
      <div>
        <p className="text-xs text-muted-foreground">Sizing</p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <button
            type="button"
            onClick={() => svgDims && setSizingMode("scale")}
            disabled={!svgDims}
            className={btnClass(sizingMode === "scale")}
          >
            Scale Factor
          </button>
          <button
            type="button"
            onClick={() => setSizingMode("custom")}
            className={btnClass(sizingMode === "custom")}
          >
            Custom Size
          </button>
        </div>
      </div>

      {/* Scale controls */}
      {sizingMode === "scale" && svgDims && (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-1">
            {SCALE_PRESETS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setScale(s)}
                className={btnClass(scale === s)}
              >
                {s}x
              </button>
            ))}
          </div>
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Scale</span>
              <span className="text-xs font-mono text-foreground">{scale}x</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={8}
              step={0.25}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
        </div>
      )}

      {/* Custom size controls */}
      {sizingMode === "custom" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="svg-custom-width" className="text-xs text-muted-foreground">
              Width (px)
            </label>
            <input
              id="svg-custom-width"
              type="number"
              value={customWidth}
              onChange={(e) => setCustomWidth(Number(e.target.value))}
              min={1}
              max={16384}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="svg-custom-height" className="text-xs text-muted-foreground">
              Height (px)
            </label>
            <input
              id="svg-custom-height"
              type="number"
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
              placeholder="Auto"
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>
        </div>
      )}

      <div className="border-t border-border" />

      {/* Render DPI */}
      <div>
        <p className="text-xs text-muted-foreground">Render DPI</p>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {DPI_PRESETS.map((d) => (
            <button type="button" key={d} onClick={() => setDpi(d)} className={btnClass(dpi === d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Format */}
      <div>
        <p className="text-xs text-muted-foreground">Format</p>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {FORMATS.map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`uppercase ${btnClass(format === f)}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Quality (lossy only) */}
      {isLossy && (
        <>
          <div className="border-t border-border" />
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Quality</span>
              <span className="text-xs font-mono text-foreground">{quality}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
        </>
      )}

      <div className="border-t border-border" />

      {/* Background */}
      <div>
        <p className="text-xs text-muted-foreground">Background</p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <button
            type="button"
            onClick={() => !NO_TRANSPARENCY_FORMATS.includes(format) && setBgMode("transparent")}
            disabled={NO_TRANSPARENCY_FORMATS.includes(format)}
            className={btnClass(bgMode === "transparent")}
          >
            Transparent
          </button>
          <button
            type="button"
            onClick={() => setBgMode("color")}
            className={btnClass(bgMode === "color")}
          >
            Color
          </button>
        </div>
      </div>

      {bgMode === "color" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBgColor("#ffffff")}
            className={`w-8 h-8 rounded border-2 bg-white ${bgColor === "#ffffff" ? "border-primary" : "border-border"}`}
            aria-label={t.a11y.whiteBackground}
          />
          <button
            type="button"
            onClick={() => setBgColor("#000000")}
            className={`w-8 h-8 rounded border-2 bg-black ${bgColor === "#000000" ? "border-primary" : "border-border"}`}
            aria-label={t.a11y.blackBackground}
          />
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-8 w-8 rounded border border-border cursor-pointer"
          />
          <span className="text-xs font-mono text-muted-foreground">{bgColor}</span>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process / Progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={files.length > 1 ? `Converting ${files.length} files` : "Converting SVG"}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="svg-to-raster-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Convert (${files.length} files)` : "Convert SVG"}
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="svg-to-raster-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
