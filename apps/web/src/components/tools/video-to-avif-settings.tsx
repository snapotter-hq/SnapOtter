import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

interface AvifSettings {
  fps: number;
  width: number;
  startS: number;
  durationS: number;
  quality: number;
  loop: boolean;
}

const DEFAULTS: AvifSettings = {
  fps: 12,
  width: 480,
  startS: 0,
  durationS: 5,
  quality: 50,
  loop: true,
};

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={INPUT_CLASS}
      />
    </div>
  );
}

function AvifFields({
  idPrefix,
  settings,
  onChange,
}: {
  idPrefix: string;
  settings: AvifSettings;
  onChange: (patch: Partial<AvifSettings>) => void;
}) {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-avif"];
  return (
    <>
      <NumberField
        id={`${idPrefix}-fps`}
        label={s.fps}
        value={settings.fps}
        onChange={(fps) => onChange({ fps })}
        min={1}
        max={30}
        step={1}
      />
      <NumberField
        id={`${idPrefix}-width`}
        label={s.width}
        value={settings.width}
        onChange={(width) => onChange({ width })}
        min={64}
        max={1280}
        step={1}
      />
      <NumberField
        id={`${idPrefix}-start`}
        label={s.start}
        value={settings.startS}
        onChange={(startS) => onChange({ startS })}
        min={0}
        step={0.1}
      />
      <NumberField
        id={`${idPrefix}-duration`}
        label={s.duration}
        value={settings.durationS}
        onChange={(durationS) => onChange({ durationS })}
        min={0.1}
        max={60}
        step={0.1}
      />
      <NumberField
        id={`${idPrefix}-quality`}
        label={s.quality}
        value={settings.quality}
        onChange={(quality) => onChange({ quality })}
        min={1}
        max={100}
        step={1}
      />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={settings.loop}
          onChange={(e) => onChange({ loop: e.target.checked })}
          className="rounded"
        />
        {s.loop}
      </label>
    </>
  );
}

export function VideoToAvifSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["video-to-avif"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("video-to-avif");

  const [settings, setSettings] = useState<AvifSettings>(DEFAULTS);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    if (hasMultiple) {
      processAllFiles(files, { ...settings });
    } else {
      processFiles(files, { ...settings });
    }
  };

  return (
    <div className="space-y-4">
      <AvifFields
        idPrefix="v2a"
        settings={settings}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
      />

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
          data-testid="video-to-avif-submit"
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

export interface VideoToAvifControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function VideoToAvifControls({ settings: initial, onChange }: VideoToAvifControlsProps) {
  const [settings, setSettings] = useState<AvifSettings>(DEFAULTS);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    setSettings((prev) => ({
      fps: initial.fps != null ? Number(initial.fps) : prev.fps,
      width: initial.width != null ? Number(initial.width) : prev.width,
      startS: initial.startS != null ? Number(initial.startS) : prev.startS,
      durationS: initial.durationS != null ? Number(initial.durationS) : prev.durationS,
      quality: initial.quality != null ? Number(initial.quality) : prev.quality,
      loop: initial.loop != null ? Boolean(initial.loop) : prev.loop,
    }));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ ...settings });
  }, [settings]);

  return (
    <div className="space-y-4">
      <AvifFields
        idPrefix="v2ap"
        settings={settings}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
}
