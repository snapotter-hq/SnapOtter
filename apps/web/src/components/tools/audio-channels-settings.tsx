import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type ChannelMode = "stereo-to-mono" | "mono-to-stereo" | "swap";

export function AudioChannelsSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-channels"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("audio-channels");

  const [mode, setMode] = useState<ChannelMode>("mono-to-stereo");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { mode };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ac-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="ac-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ChannelMode)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="stereo-to-mono">{s["stereo-to-mono"]}</option>
          <option value="mono-to-stereo">{s["mono-to-stereo"]}</option>
          <option value="swap">{s.swap}</option>
        </select>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          data-testid="audio-channels-submit"
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

export interface AudioChannelsControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function AudioChannelsControls({ settings: initial, onChange }: AudioChannelsControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-channels"];
  const [mode, setMode] = useState<ChannelMode>("stereo-to-mono");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.mode != null) setMode(initial.mode as ChannelMode);
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ mode });
  }, [mode]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="acp-mode" className="text-xs text-muted-foreground">
          {s.mode}
        </label>
        <select
          id="acp-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ChannelMode)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="stereo-to-mono">{s["stereo-to-mono"]}</option>
          <option value="mono-to-stereo">{s["mono-to-stereo"]}</option>
          <option value="swap">{s.swap}</option>
        </select>
      </div>
    </div>
  );
}
