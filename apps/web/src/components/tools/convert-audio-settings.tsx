import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type AudioFormat = "mp3" | "wav" | "ogg" | "flac" | "m4a";

const BITRATE_OPTIONS = [96, 128, 192, 256, 320] as const;

export function ConvertAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-audio");

  const [outFormat, setOutFormat] = useState<AudioFormat>("mp3");
  const [bitrateKbps, setBitrateKbps] = useState(192);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { format: outFormat, bitrateKbps };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ca-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="ca-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as AudioFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="ogg">OGG</option>
          <option value="flac">FLAC</option>
          <option value="m4a">M4A</option>
        </select>
      </div>

      <div>
        <label htmlFor="ca-bitrate" className="text-xs text-muted-foreground">
          {s.bitrate}
        </label>
        <select
          id="ca-bitrate"
          value={bitrateKbps}
          onChange={(e) => setBitrateKbps(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {BITRATE_OPTIONS.map((br) => (
            <option key={br} value={br}>
              {br} kbps
            </option>
          ))}
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
          data-testid="convert-audio-submit"
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

export interface ConvertAudioControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ConvertAudioControls({ settings: initial, onChange }: ConvertAudioControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-audio"];
  const [outFormat, setOutFormat] = useState<AudioFormat>("mp3");
  const [bitrateKbps, setBitrateKbps] = useState(192);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.format != null) setOutFormat(initial.format as AudioFormat);
    if (initial.bitrateKbps != null) setBitrateKbps(Number(initial.bitrateKbps));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ format: outFormat, bitrateKbps });
  }, [outFormat, bitrateKbps]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ca-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="ca-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as AudioFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="ogg">OGG</option>
          <option value="flac">FLAC</option>
          <option value="m4a">M4A</option>
        </select>
      </div>
      <div>
        <label htmlFor="ca-bitrate" className="text-xs text-muted-foreground">
          {s.bitrate}
        </label>
        <select
          id="ca-bitrate"
          value={bitrateKbps}
          onChange={(e) => setBitrateKbps(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {BITRATE_OPTIONS.map((br) => (
            <option key={br} value={br}>
              {br} kbps
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
