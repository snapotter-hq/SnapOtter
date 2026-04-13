import { Download, FlipHorizontal2, FlipVertical2, Link, RotateCw, Unlink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useGifInfo } from "@/hooks/use-gif-info";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

type GifMode = "resize" | "optimize" | "speed" | "reverse" | "extract" | "rotate";
type LoopMode = "infinite" | "once" | "custom";
type ResizeTab = "pixel" | "percentage";
type ExtractTab = "single" | "range" | "all";

const MODES: { id: GifMode; label: string; requiresAnimation: boolean }[] = [
  { id: "resize", label: "Resize", requiresAnimation: false },
  { id: "optimize", label: "Optimize", requiresAnimation: false },
  { id: "speed", label: "Speed", requiresAnimation: true },
  { id: "reverse", label: "Reverse", requiresAnimation: true },
  { id: "extract", label: "Extract", requiresAnimation: true },
  { id: "rotate", label: "Rotate", requiresAnimation: false },
];

export interface GifToolsControlsProps {
  onChange?: (settings: Record<string, unknown>) => void;
}

export function GifToolsControls({ onChange }: GifToolsControlsProps) {
  const { info, loading: infoLoading } = useGifInfo();
  const isAnimated = (info?.pages ?? 0) > 1;

  // Mode
  const [mode, setMode] = useState<GifMode>("resize");

  // Resize state
  const [resizeTab, setResizeTab] = useState<ResizeTab>("pixel");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percentage, setPercentage] = useState("50");
  const [lockAspect, setLockAspect] = useState(true);

  // Optimize state
  const [colors, setColors] = useState(256);
  const [dither, setDither] = useState(1.0);
  const [effort, setEffort] = useState(7);

  // Speed state
  const [speedFactor, setSpeedFactor] = useState(1.0);

  // Reverse state
  const [reverseAdjustSpeed, setReverseAdjustSpeed] = useState(false);
  const [reverseSpeed, setReverseSpeed] = useState(1.0);

  // Extract state
  const [extractTab, setExtractTab] = useState<ExtractTab>("single");
  const [frameNumber, setFrameNumber] = useState("0");
  const [frameStart, setFrameStart] = useState("0");
  const [frameEnd, setFrameEnd] = useState("");
  const [extractFormat, setExtractFormat] = useState<"png" | "webp">("png");

  // Rotate state
  const [angle, setAngle] = useState<number | null>(null);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Loop control
  const [loopMode, setLoopMode] = useState<LoopMode>("infinite");
  const [loopCount, setLoopCount] = useState("2");

  // Initialize loop from metadata
  useEffect(() => {
    if (info) {
      if (info.loop === 0) setLoopMode("infinite");
      else if (info.loop === 1) setLoopMode("once");
      else {
        setLoopMode("custom");
        setLoopCount(String(info.loop));
      }
    }
  }, [info]);

  // Emit settings
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const loopValue =
      loopMode === "infinite" ? 0 : loopMode === "once" ? 1 : Number(loopCount) || 2;

    const settings: Record<string, unknown> = { mode, loop: loopValue };

    switch (mode) {
      case "resize":
        if (resizeTab === "percentage") {
          settings.percentage = Number(percentage) || 50;
        } else {
          if (width) settings.width = Number(width);
          if (height) settings.height = Number(height);
        }
        break;
      case "optimize":
        settings.colors = colors;
        settings.dither = dither;
        settings.effort = effort;
        break;
      case "speed":
        settings.speedFactor = speedFactor;
        break;
      case "reverse":
        if (reverseAdjustSpeed) {
          settings.speedFactor = reverseSpeed;
        }
        break;
      case "extract":
        settings.extractMode = extractTab;
        settings.extractFormat = extractFormat;
        if (extractTab === "single") {
          settings.frameNumber = Number(frameNumber) || 0;
        } else if (extractTab === "range") {
          settings.frameStart = Number(frameStart) || 0;
          if (frameEnd) settings.frameEnd = Number(frameEnd);
        }
        break;
      case "rotate":
        if (angle) settings.angle = angle;
        settings.flipH = flipH;
        settings.flipV = flipV;
        break;
    }

    onChangeRef.current?.(settings);
  }, [
    mode,
    resizeTab,
    width,
    height,
    percentage,
    lockAspect,
    colors,
    dither,
    effort,
    speedFactor,
    reverseAdjustSpeed,
    reverseSpeed,
    extractTab,
    frameNumber,
    frameStart,
    frameEnd,
    extractFormat,
    angle,
    flipH,
    flipV,
    loopMode,
    loopCount,
  ]);

  const tabClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  const maxFrame = Math.max(0, (info?.pages ?? 1) - 1);

  return (
    <div className="space-y-4">
      {/* GIF Info Bar */}
      {infoLoading && (
        <div className="text-xs text-muted-foreground animate-pulse">Reading GIF metadata...</div>
      )}
      {info && !infoLoading && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
          {isAnimated ? (
            <>
              <span>{info.pages} frames</span>
              <span className="text-border">|</span>
              <span>
                {info.width}x{info.height}
              </span>
              <span className="text-border">|</span>
              <span>{(info.duration / 1000).toFixed(1)}s</span>
              <span className="text-border">|</span>
              <span>{(info.fileSize / 1024).toFixed(0)} KB</span>
            </>
          ) : (
            <>
              <span className="text-amber-500 font-medium">Static image</span>
              <span className="text-border">|</span>
              <span>
                {info.width}x{info.height}
              </span>
              <span className="text-border">|</span>
              <span>{(info.fileSize / 1024).toFixed(0)} KB</span>
            </>
          )}
        </div>
      )}

      {/* Mode Tabs (3x2 grid) */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Mode</p>
        <div className="grid grid-cols-3 gap-1">
          {MODES.map((m) => {
            const disabled = m.requiresAnimation && !isAnimated;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(m.id)}
                title={disabled ? "Requires animated GIF" : undefined}
                className={`text-xs py-1.5 rounded transition-colors ${
                  mode === m.id
                    ? "bg-primary text-primary-foreground"
                    : disabled
                      ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Controls */}

      {mode === "resize" && (
        <div className="space-y-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setResizeTab("pixel")}
              className={tabClass(resizeTab === "pixel")}
            >
              Pixels
            </button>
            <button
              type="button"
              onClick={() => setResizeTab("percentage")}
              className={tabClass(resizeTab === "percentage")}
            >
              Percentage
            </button>
          </div>

          {resizeTab === "pixel" ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="gif-width" className="text-xs text-muted-foreground">
                  Width (px)
                </label>
                <input
                  id="gif-width"
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="Auto"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => setLockAspect(!lockAspect)}
                className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {lockAspect ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
              </button>
              <div className="flex-1">
                <label htmlFor="gif-height" className="text-xs text-muted-foreground">
                  Height (px)
                </label>
                <input
                  id="gif-height"
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Auto"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="gif-pct" className="text-xs text-muted-foreground">
                    Scale
                  </label>
                  <span className="text-xs tabular-nums text-muted-foreground">{percentage}%</span>
                </div>
                <input
                  id="gif-pct"
                  type="range"
                  min={10}
                  max={200}
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
                />
              </div>
              <div className="flex gap-1">
                {[25, 50, 75, 200].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentage(String(pct))}
                    className={tabClass(percentage === String(pct))}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "optimize" && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="gif-colors" className="text-xs text-muted-foreground">
                Colors
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">{colors}</span>
            </div>
            <input
              id="gif-colors"
              type="range"
              min={2}
              max={256}
              step={2}
              value={colors}
              onChange={(e) => setColors(Number(e.target.value))}
              className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Fewer colors = smaller file</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="gif-dither" className="text-xs text-muted-foreground">
                Dither
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {dither.toFixed(1)}
              </span>
            </div>
            <input
              id="gif-dither"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={dither}
              onChange={(e) => setDither(Number(e.target.value))}
              className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="gif-effort" className="text-xs text-muted-foreground">
                Effort
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">{effort}</span>
            </div>
            <input
              id="gif-effort"
              type="range"
              min={1}
              max={10}
              value={effort}
              onChange={(e) => setEffort(Number(e.target.value))}
              className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Higher effort = slower but smaller
            </p>
          </div>
        </div>
      )}

      {mode === "speed" && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="gif-speed" className="text-xs text-muted-foreground">
                Speed
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {speedFactor.toFixed(1)}x
              </span>
            </div>
            <input
              id="gif-speed"
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={speedFactor}
              onChange={(e) => setSpeedFactor(Number(e.target.value))}
              className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
            />
          </div>
          <div className="flex gap-1">
            {[0.5, 1, 2, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeedFactor(s)}
                className={tabClass(speedFactor === s)}
              >
                {s}x
              </button>
            ))}
          </div>
          {info && (
            <p className="text-[10px] text-muted-foreground">
              {(info.duration / 1000).toFixed(1)}s {"->"}{" "}
              {(info.duration / 1000 / speedFactor).toFixed(1)}s
            </p>
          )}
        </div>
      )}

      {mode === "reverse" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Reverses the playback order of all frames.
          </p>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={reverseAdjustSpeed}
              onChange={(e) => setReverseAdjustSpeed(e.target.checked)}
              className="rounded"
            />
            Also adjust speed
          </label>
          {reverseAdjustSpeed && (
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="gif-rev-speed" className="text-xs text-muted-foreground">
                  Speed
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {reverseSpeed.toFixed(1)}x
                </span>
              </div>
              <input
                id="gif-rev-speed"
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={reverseSpeed}
                onChange={(e) => setReverseSpeed(Number(e.target.value))}
                className="w-full mt-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
              />
            </div>
          )}
        </div>
      )}

      {mode === "extract" && (
        <div className="space-y-3">
          <div className="flex gap-1">
            {(["single", "range", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setExtractTab(t)}
                className={tabClass(extractTab === t)}
              >
                {t === "single" ? "Single" : t === "range" ? "Range" : "All"}
              </button>
            ))}
          </div>

          {extractTab === "single" && (
            <div>
              <label htmlFor="gif-frame" className="text-xs text-muted-foreground">
                Frame Number
              </label>
              <input
                id="gif-frame"
                type="number"
                value={frameNumber}
                onChange={(e) => setFrameNumber(e.target.value)}
                min={0}
                max={maxFrame}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                0 to {maxFrame} (0 is first frame)
              </p>
            </div>
          )}

          {extractTab === "range" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="gif-frame-start" className="text-xs text-muted-foreground">
                  Start
                </label>
                <input
                  id="gif-frame-start"
                  type="number"
                  value={frameStart}
                  onChange={(e) => setFrameStart(e.target.value)}
                  min={0}
                  max={maxFrame}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="gif-frame-end" className="text-xs text-muted-foreground">
                  End
                </label>
                <input
                  id="gif-frame-end"
                  type="number"
                  value={frameEnd}
                  onChange={(e) => setFrameEnd(e.target.value)}
                  min={0}
                  max={maxFrame}
                  placeholder={String(maxFrame)}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
                />
              </div>
            </div>
          )}

          {extractTab === "all" && (
            <p className="text-xs text-muted-foreground">
              Extracts all {info?.pages ?? "?"} frames as individual images in a ZIP.
            </p>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-1">Output Format</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setExtractFormat("png")}
                className={tabClass(extractFormat === "png")}
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => setExtractFormat("webp")}
                className={tabClass(extractFormat === "webp")}
              >
                WebP
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "rotate" && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Angle</p>
            <div className="flex gap-1">
              {[90, 180, 270].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAngle(angle === a ? null : a)}
                  className={tabClass(angle === a)}
                >
                  <span className="flex items-center justify-center gap-1">
                    <RotateCw className="h-3 w-3" />
                    {a}°
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Flip</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setFlipH(!flipH)} className={tabClass(flipH)}>
                <span className="flex items-center justify-center gap-1">
                  <FlipHorizontal2 className="h-3 w-3" />
                  Horizontal
                </span>
              </button>
              <button type="button" onClick={() => setFlipV(!flipV)} className={tabClass(flipV)}>
                <span className="flex items-center justify-center gap-1">
                  <FlipVertical2 className="h-3 w-3" />
                  Vertical
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loop Control */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-1">Loop</p>
        <div className="flex gap-1">
          {(["infinite", "once", "custom"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLoopMode(l)}
              className={tabClass(loopMode === l)}
            >
              {l === "infinite" ? "Infinite" : l === "once" ? "Once" : "Custom"}
            </button>
          ))}
        </div>
        {loopMode === "custom" && (
          <input
            type="number"
            value={loopCount}
            onChange={(e) => setLoopCount(e.target.value)}
            min={2}
            max={100}
            className="w-full mt-1.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        )}
      </div>
    </div>
  );
}

export function GifToolsSettings() {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("gif-tools");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <GifToolsControls onChange={setSettings} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>
            Processed: {(processedSize / 1024).toFixed(1)} KB
            {originalSize > 0 && (
              <span className="ml-1">
                ({Math.round(((processedSize - originalSize) / originalSize) * 100)}%)
              </span>
            )}
          </p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Processing GIF"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="gif-tools-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Process (${files.length} files)` : "Process"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="gif-tools-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
