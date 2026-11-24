import { FONT_FORMATS, type FontFormat } from "@snapotter/shared";
import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

/**
 * The output choices for an input extension: never the input's own format, and
 * WOFF2 first for a TTF, since that is what a TTF is usually converted for.
 */
export function fontTargets(inputExt: string | undefined): FontFormat[] {
  const targets = FONT_FORMATS.filter((f) => f !== inputExt);
  return inputExt === "ttf" ? ["woff2", ...targets.filter((f) => f !== "woff2")] : targets;
}

export function ConvertFontSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-font"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-font");

  const [outFormat, setOutFormat] = useState<FontFormat | null>(null);

  const targets = fontTargets(files[0]?.name.split(".").pop()?.toLowerCase());
  const selected = outFormat && targets.includes(outFormat) ? outFormat : targets[0];

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
        <label htmlFor="cf-format" className="text-xs text-muted-foreground">
          {s.format}
        </label>
        <select
          id="cf-format"
          value={selected}
          onChange={(e) => setOutFormat(e.target.value as FontFormat)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {targets.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[10px] text-muted-foreground">{s.hint}</p>

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
          data-testid="convert-font-submit"
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
