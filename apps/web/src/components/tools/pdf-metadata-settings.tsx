import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function PdfMetadataSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["pdf-metadata"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("pdf-metadata");

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings: Record<string, string> = {};
    if (title) settings.title = title;
    if (author) settings.author = author;
    if (subject) settings.subject = subject;
    if (keywords) settings.keywords = keywords;
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="pm-title" className="text-xs text-muted-foreground">
          {s.title}
        </label>
        <input
          id="pm-title"
          type="text"
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="pm-author" className="text-xs text-muted-foreground">
          {s.author}
        </label>
        <input
          id="pm-author"
          type="text"
          maxLength={500}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="pm-subject" className="text-xs text-muted-foreground">
          {s.subject}
        </label>
        <input
          id="pm-subject"
          type="text"
          maxLength={500}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="pm-keywords" className="text-xs text-muted-foreground">
          {s.keywords}
        </label>
        <input
          id="pm-keywords"
          type="text"
          maxLength={500}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
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
          data-testid="pdf-metadata-submit"
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

export interface PdfMetadataControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function PdfMetadataControls({ settings: initial, onChange }: PdfMetadataControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["pdf-metadata"];
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.title != null) setTitle(String(initial.title));
    if (initial.author != null) setAuthor(String(initial.author));
    if (initial.subject != null) setSubject(String(initial.subject));
    if (initial.keywords != null) setKeywords(String(initial.keywords));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const out: Record<string, unknown> = {};
    if (title) out.title = title;
    if (author) out.author = author;
    if (subject) out.subject = subject;
    if (keywords) out.keywords = keywords;
    onChangeRef.current?.(out);
  }, [title, author, subject, keywords]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="pmc-title" className="text-xs text-muted-foreground">
          {s.title}
        </label>
        <input
          id="pmc-title"
          type="text"
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="pmc-author" className="text-xs text-muted-foreground">
          {s.author}
        </label>
        <input
          id="pmc-author"
          type="text"
          maxLength={500}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="pmc-subject" className="text-xs text-muted-foreground">
          {s.subject}
        </label>
        <input
          id="pmc-subject"
          type="text"
          maxLength={500}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="pmc-keywords" className="text-xs text-muted-foreground">
          {s.keywords}
        </label>
        <input
          id="pmc-keywords"
          type="text"
          maxLength={500}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
