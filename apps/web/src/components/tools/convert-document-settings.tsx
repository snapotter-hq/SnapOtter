import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type DocFormat = "docx" | "odt" | "rtf" | "txt";

const ALL_FORMATS: { value: DocFormat; label: string }[] = [
  { value: "docx", label: "DOCX" },
  { value: "odt", label: "ODT" },
  { value: "rtf", label: "RTF" },
  { value: "txt", label: "TXT" },
];

export function ConvertDocumentSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-document"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-document");

  const [outFormat, setOutFormat] = useState<DocFormat>("odt");

  // Never offer the input's own format as a target. LibreOffice rejects a
  // same-format conversion ("already in that format"), so drop it from the
  // options and keep the current selection valid.
  const inputExt = files[0]?.name.split(".").pop()?.toLowerCase();
  const formats = ALL_FORMATS.filter((f) => f.value !== inputExt);
  const selected = formats.some((f) => f.value === outFormat)
    ? outFormat
    : (formats[0]?.value ?? outFormat);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { format: selected };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cd-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="cd-format"
          value={selected}
          onChange={(e) => setOutFormat(e.target.value as DocFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {formats.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
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
          data-testid="convert-document-submit"
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

export interface ConvertDocumentControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ConvertDocumentControls({
  settings: initial,
  onChange,
}: ConvertDocumentControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-document"];
  const [outFormat, setOutFormat] = useState<DocFormat>("docx");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.format != null) setOutFormat(initial.format as DocFormat);
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ format: outFormat });
  }, [outFormat]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cdc-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="cdc-format"
          value={outFormat}
          onChange={(e) => setOutFormat(e.target.value as DocFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {ALL_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
