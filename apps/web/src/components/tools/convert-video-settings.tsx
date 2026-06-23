import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type VideoFormat = "mp4" | "mov" | "webm";
type Quality = "high" | "balanced" | "small";

export function ConvertVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-video");

  const [outFormat, setOutFormat] = useState<VideoFormat>("mp4");
  const [quality, setQuality] = useState<Quality>("balanced");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { format: outFormat, quality };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cv-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="cv-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as VideoFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="mp4">MP4</option>
          <option value="mov">MOV</option>
          <option value="webm">WebM</option>
        </select>
      </div>

      <div>
        <label htmlFor="cv-quality" className="text-xs text-muted-foreground">
          {s.quality}
        </label>
        <select
          id="cv-quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as Quality)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="high">{s.high}</option>
          <option value="balanced">{s.balanced}</option>
          <option value="small">{s.small}</option>
        </select>
      </div>

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
          data-testid="convert-video-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface ConvertVideoControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ConvertVideoControls({ settings: initial, onChange }: ConvertVideoControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-video"];
  const [outFormat, setOutFormat] = useState<VideoFormat>("mp4");
  const [quality, setQuality] = useState<Quality>("balanced");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.format != null) setOutFormat(initial.format as VideoFormat);
    if (initial.quality != null) setQuality(initial.quality as Quality);
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ format: outFormat, quality });
  }, [outFormat, quality]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cvp-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="cvp-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as VideoFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="mp4">MP4</option>
          <option value="mov">MOV</option>
          <option value="webm">WebM</option>
        </select>
      </div>
      <div>
        <label htmlFor="cvp-quality" className="text-xs text-muted-foreground">
          {s.quality}
        </label>
        <select
          id="cvp-quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as Quality)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="high">{s.high}</option>
          <option value="balanced">{s.balanced}</option>
          <option value="small">{s.small}</option>
        </select>
      </div>
    </div>
  );
}
