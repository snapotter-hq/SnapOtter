import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import {
  TrimFields,
  type TrimValue,
  trimPayload,
  trimProblem,
  trimValueFrom,
} from "@/components/common/trim-fields";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const DEFAULT_TRIM: TrimValue = { mode: "range", startS: 0, endS: 10, cutStartS: 0, cutEndS: 0 };
const DEFAULT_PIPELINE_TRIM: TrimValue = { ...DEFAULT_TRIM, endS: 0 };

export function TrimVideoSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-video"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("trim-video");

  const [trim, setTrim] = useState<TrimValue>(DEFAULT_TRIM);
  const [textValid, setTextValid] = useState(true);
  const [precise, setPrecise] = useState(false);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const trimValid = textValid && trimProblem(trim) === null;

  const handleProcess = () => {
    const settings = { ...trimPayload(trim), precise };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <TrimFields
        idPrefix="tv"
        value={trim}
        onChange={setTrim}
        labels={s}
        onTextValidityChange={setTextValid}
      />

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={precise}
          onChange={(e) => setPrecise(e.target.checked)}
          className="rounded"
        />
        {s.precise}
      </label>

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
          data-testid="trim-video-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !trimValid}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface TrimVideoControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function TrimVideoControls({ settings: initial, onChange }: TrimVideoControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-video"];
  const [trim, setTrim] = useState<TrimValue>(DEFAULT_PIPELINE_TRIM);
  const [precise, setPrecise] = useState(false);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    setTrim(trimValueFrom(initial, DEFAULT_PIPELINE_TRIM));
    if (initial.precise != null) setPrecise(Boolean(initial.precise));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ ...trimPayload(trim), precise });
  }, [trim, precise]);

  return (
    <div className="space-y-4">
      <TrimFields idPrefix="tvp" value={trim} onChange={setTrim} labels={s} />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={precise}
          onChange={(e) => setPrecise(e.target.checked)}
          className="rounded"
        />
        {s.precise}
      </label>
    </div>
  );
}
