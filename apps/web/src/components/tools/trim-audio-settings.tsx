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

export function TrimAudioSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-audio"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("trim-audio");

  const [trim, setTrim] = useState<TrimValue>(DEFAULT_TRIM);
  const [textValid, setTextValid] = useState(true);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;
  const trimValid = textValid && trimProblem(trim) === null;

  const handleProcess = () => {
    const settings = trimPayload(trim);
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <TrimFields
        idPrefix="ta"
        value={trim}
        onChange={setTrim}
        labels={s}
        onTextValidityChange={setTextValid}
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
          data-testid="trim-audio-submit"
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

export interface TrimAudioControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function TrimAudioControls({ settings: initial, onChange }: TrimAudioControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["trim-audio"];
  const [trim, setTrim] = useState<TrimValue>(DEFAULT_PIPELINE_TRIM);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    setTrim(trimValueFrom(initial, DEFAULT_PIPELINE_TRIM));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.(trimPayload(trim));
  }, [trim]);

  return (
    <div className="space-y-4">
      <TrimFields idPrefix="tap" value={trim} onChange={setTrim} labels={s} />
    </div>
  );
}
