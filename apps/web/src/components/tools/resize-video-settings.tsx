import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Preset = "custom" | "2160p" | "1440p" | "1080p" | "720p" | "480p" | "360p";

export function ResizeVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["resize-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("resize-video");

  const [preset, setPreset] = useState<Preset>("custom");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const isCustom = preset === "custom";
  const customValid = !isCustom || width !== "" || height !== "";

  const handleProcess = () => {
    const settings: Record<string, unknown> = { preset };
    if (isCustom) {
      if (width !== "") settings.width = width;
      if (height !== "") settings.height = height;
    }
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rv-preset" className="text-xs text-muted-foreground">
          {s.preset}
        </label>
        <select
          id="rv-preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="custom">Custom</option>
          <option value="2160p">2160p (4K)</option>
          <option value="1440p">1440p (2K)</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
          <option value="360p">360p</option>
        </select>
      </div>

      {isCustom && (
        <>
          <div>
            <label htmlFor="rv-width" className="text-xs text-muted-foreground">
              {s.width}
            </label>
            <input
              id="rv-width"
              type="number"
              min={16}
              max={7680}
              value={width}
              onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>

          <div>
            <label htmlFor="rv-height" className="text-xs text-muted-foreground">
              {s.height}
            </label>
            <input
              id="rv-height"
              type="number"
              min={16}
              max={4320}
              value={height}
              onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>

          <p className="text-[10px] text-muted-foreground">{s.hint}</p>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="resize-video-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !customValid}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface ResizeVideoControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ResizeVideoControls({ settings: initial, onChange }: ResizeVideoControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["resize-video"];
  const [preset, setPreset] = useState<Preset>("custom");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.preset != null) setPreset(initial.preset as Preset);
    if (initial.width != null) setWidth(Number(initial.width));
    if (initial.height != null) setHeight(Number(initial.height));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const out: Record<string, unknown> = { preset };
    if (preset === "custom") {
      if (width !== "") out.width = width;
      if (height !== "") out.height = height;
    }
    onChangeRef.current?.(out);
  }, [preset, width, height]);

  const isCustom = preset === "custom";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rvp-preset" className="text-xs text-muted-foreground">
          {s.preset}
        </label>
        <select
          id="rvp-preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="custom">Custom</option>
          <option value="2160p">2160p (4K)</option>
          <option value="1440p">1440p (2K)</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
          <option value="360p">360p</option>
        </select>
      </div>
      {isCustom && (
        <>
          <div>
            <label htmlFor="rvp-width" className="text-xs text-muted-foreground">
              {s.width}
            </label>
            <input
              id="rvp-width"
              type="number"
              min={16}
              max={7680}
              value={width}
              onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="rvp-height" className="text-xs text-muted-foreground">
              {s.height}
            </label>
            <input
              id="rvp-height"
              type="number"
              min={16}
              max={4320}
              value={height}
              onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
            />
          </div>
        </>
      )}
    </div>
  );
}
