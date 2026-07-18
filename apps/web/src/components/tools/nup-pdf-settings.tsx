import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type PerSheet = 2 | 3 | 4 | 8 | 9 | 12 | 16;

export function NupPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["nup-pdf"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("nup-pdf");

  const [perSheet, setPerSheet] = useState<PerSheet>(2);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { perSheet };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="nup-per-sheet" className="text-xs text-muted-foreground">
          {s.perSheet}
        </label>
        <select
          id="nup-per-sheet"
          value={perSheet}
          onChange={(e) => setPerSheet(Number(e.target.value) as PerSheet)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={9}>9</option>
          <option value={12}>12</option>
          <option value={16}>16</option>
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
          data-testid="nup-pdf-submit"
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

export interface NupPdfControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function NupPdfControls({ settings: initial, onChange }: NupPdfControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["nup-pdf"];
  const [perSheet, setPerSheet] = useState<PerSheet>(2);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.perSheet != null) setPerSheet(Number(initial.perSheet) as PerSheet);
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ perSheet });
  }, [perSheet]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="nupc-per-sheet" className="text-xs text-muted-foreground">
          {s.perSheet}
        </label>
        <select
          id="nupc-per-sheet"
          value={perSheet}
          onChange={(e) => setPerSheet(Number(e.target.value) as PerSheet)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={9}>9</option>
          <option value={12}>12</option>
          <option value={16}>16</option>
        </select>
      </div>
    </div>
  );
}
