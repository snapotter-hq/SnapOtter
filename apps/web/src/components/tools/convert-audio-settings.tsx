import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type AudioFormat = "mp3" | "wav" | "ogg" | "flac" | "m4a";

const BITRATE_OPTIONS = [96, 128, 192, 256, 320] as const;

const SAMPLE_RATE_OPTIONS = [8000, 16000, 22050, 32000, 44100, 48000, 96000] as const;

// libmp3lame caps at 48 kHz, so MP3 output must not offer 96 kHz.
function sampleRatesFor(format: AudioFormat): number[] {
  return format === "mp3"
    ? SAMPLE_RATE_OPTIONS.filter((r) => r <= 48000)
    : [...SAMPLE_RATE_OPTIONS];
}

// libmp3lame also caps the bitrate at low rates (64 kbps at 8 kHz, 160 kbps at
// 16/22.05 kHz) and would clamp silently; offer only combinations it honors.
function bitratesFor(format: AudioFormat, sampleRate: number): number[] {
  if (format !== "mp3" || !sampleRate || sampleRate >= 32000) return [...BITRATE_OPTIONS];
  if (sampleRate === 8000) return [32, 48, 64];
  return BITRATE_OPTIONS.filter((b) => b <= 160);
}

function reconcileBitrate(bitrateKbps: number, options: number[]): number {
  if (options.includes(bitrateKbps)) return bitrateKbps;
  return options.includes(192) ? 192 : options[options.length - 1];
}

export function ConvertAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-audio");

  const [outFormat, setOutFormat] = useState<AudioFormat>("mp3");
  const [bitrateKbps, setBitrateKbps] = useState(192);
  // 0 = preserve the source sample rate (omit the setting).
  const [sampleRate, setSampleRate] = useState(0);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleFormatChange = (format: AudioFormat) => {
    setOutFormat(format);
    const rate = sampleRatesFor(format).includes(sampleRate) ? sampleRate : 0;
    if (rate !== sampleRate) setSampleRate(rate);
    setBitrateKbps((b) => reconcileBitrate(b, bitratesFor(format, rate)));
  };

  const handleSampleRateChange = (rate: number) => {
    setSampleRate(rate);
    setBitrateKbps((b) => reconcileBitrate(b, bitratesFor(outFormat, rate)));
  };

  const handleProcess = () => {
    const settings = {
      format: outFormat,
      bitrateKbps,
      ...(sampleRate ? { sampleRate } : {}),
    };
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
          onChange={(e) => handleFormatChange(e.target.value as AudioFormat)}
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
          {bitratesFor(outFormat, sampleRate).map((br) => (
            <option key={br} value={br}>
              {br} kbps
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ca-samplerate" className="text-xs text-muted-foreground">
          {s.sampleRate}
        </label>
        <select
          id="ca-samplerate"
          value={sampleRate}
          onChange={(e) => handleSampleRateChange(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value={0}>{s.sampleRatePreserve}</option>
          {sampleRatesFor(outFormat).map((r) => (
            <option key={r} value={r}>
              {r} Hz
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
  // 0 = preserve the source sample rate (omit the setting).
  const [sampleRate, setSampleRate] = useState(0);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    const format = initial.format != null ? (initial.format as AudioFormat) : "mp3";
    if (initial.format != null) setOutFormat(format);
    // Sanitize stored values so the selects always show what will be emitted:
    // a rate the UI cannot represent falls back to preserve-original.
    const rawRate = initial.sampleRate != null ? Number(initial.sampleRate) : 0;
    const rate = sampleRatesFor(format).includes(rawRate) ? rawRate : 0;
    if (rate) setSampleRate(rate);
    if (initial.bitrateKbps != null) {
      setBitrateKbps(reconcileBitrate(Number(initial.bitrateKbps), bitratesFor(format, rate)));
    }
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({
      format: outFormat,
      bitrateKbps,
      ...(sampleRate ? { sampleRate } : {}),
    });
  }, [outFormat, bitrateKbps, sampleRate]);

  const handleFormatChange = (format: AudioFormat) => {
    setOutFormat(format);
    const rate = sampleRatesFor(format).includes(sampleRate) ? sampleRate : 0;
    if (rate !== sampleRate) setSampleRate(rate);
    setBitrateKbps((b) => reconcileBitrate(b, bitratesFor(format, rate)));
  };

  const handleSampleRateChange = (rate: number) => {
    setSampleRate(rate);
    setBitrateKbps((b) => reconcileBitrate(b, bitratesFor(outFormat, rate)));
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
          onChange={(e) => handleFormatChange(e.target.value as AudioFormat)}
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
          {bitratesFor(outFormat, sampleRate).map((br) => (
            <option key={br} value={br}>
              {br} kbps
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ca-samplerate" className="text-xs text-muted-foreground">
          {s.sampleRate}
        </label>
        <select
          id="ca-samplerate"
          value={sampleRate}
          onChange={(e) => handleSampleRateChange(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value={0}>{s.sampleRatePreserve}</option>
          {sampleRatesFor(outFormat).map((r) => (
            <option key={r} value={r}>
              {r} Hz
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
