import { useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const FORMAT_OPTIONS = [
  { value: "srt", label: "SRT" },
  { value: "vtt", label: "WebVTT" },
  { value: "ass", label: "ASS" },
] as const;

// Mirrors SUBTITLE_ENCODINGS in apps/api/src/routes/tools/convert-subtitles.ts, minus "auto".
const ENCODING_OPTIONS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1252", label: "Windows-1252" },
  { value: "windows-1250", label: "Windows-1250" },
  { value: "windows-1251", label: "Windows-1251" },
  { value: "windows-1256", label: "Windows-1256" },
  { value: "iso-8859-2", label: "ISO-8859-2" },
  { value: "gb18030", label: "GB18030" },
  { value: "big5", label: "Big5" },
  { value: "shift_jis", label: "Shift_JIS" },
  { value: "euc-kr", label: "EUC-KR" },
] as const;

export function ConvertSubtitlesSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["convert-subtitles"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("convert-subtitles");

  const [outputFormat, setOutputFormat] = useState("srt");
  const [encoding, setEncoding] = useState("auto");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { format: outputFormat, encoding };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cs-format" className="mb-1.5 block text-sm font-medium">
          {s.format}
        </label>
        <select
          id="cs-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
          className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{s.stylingHint}</p>
      </div>

      <div>
        <label htmlFor="cs-encoding" className="mb-1.5 block text-sm font-medium">
          {s.encoding}
        </label>
        <select
          id="cs-encoding"
          value={encoding}
          onChange={(e) => setEncoding(e.target.value)}
          className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="auto">{s.autoDetect}</option>
          {ENCODING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{s.encodingHint}</p>
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
          data-testid="convert-subtitles-submit"
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
