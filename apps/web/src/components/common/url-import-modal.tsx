import { AlertCircle, Check, Clock, Link, Loader2, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { type UrlImportEntry, useUrlImport } from "@/hooks/use-url-import";
import { format } from "@/lib/format";
import { extractUrls } from "@/lib/url-parser";

// ── Types ──────────────────────────────────────────────────────

interface UrlImportModalProps {
  onClose: () => void;
  onImport: (files: File[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: UrlImportEntry["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "fetching":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case "ready":
      return <Check className="h-4 w-4 text-success-ink" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split("/").pop() || url;
  } catch {
    return url;
  }
}

// ── Component ──────────────────────────────────────────────────

export function UrlImportModal({ onClose, onImport }: UrlImportModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  const { entries, importing, importUrls, addReadyFiles, retryUrl, cancel, reset, readyCount } =
    useUrlImport();

  const hasResults = entries.length > 0;

  const handleImport = useCallback(() => {
    const urls = extractUrls(text);
    if (urls.length === 0) return;
    importUrls(urls);
  }, [text, importUrls]);

  const handleAdd = useCallback(async () => {
    if (readyCount === 0) return;
    setAdding(true);
    try {
      const files = await addReadyFiles();
      if (files.length > 0) {
        onImport(files);
        onClose();
      }
    } finally {
      setAdding(false);
    }
  }, [readyCount, addReadyFiles, onImport, onClose]);

  const handleBack = useCallback(() => {
    reset();
  }, [reset]);

  const handleClose = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 cursor-default"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="url-import-title"
        className="relative z-10 w-full max-w-lg bg-background border border-border rounded-xl shadow-xl flex flex-col mx-4"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <Link className="h-5 w-5 text-primary" />
          <h2 id="url-import-title" className="text-sm font-semibold text-foreground flex-1">
            {t.urlImport.title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t.common.close}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "https://example.com/photo.jpg\nhttps://example.com/report.pdf\n- https://example.com/clip.mp4\n[My file](https://example.com/recording.mp3)"
            }
            className="w-full min-h-[120px] max-h-[240px] resize-y rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{t.urlImport.placeholder}</p>

          {/* Progress list */}
          {hasResults && (
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {entries.map((entry, i) => (
                <div key={entry.url} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                  <StatusIcon status={entry.status} />
                  <span className="flex-1 truncate text-foreground">
                    {entry.filename || filenameFromUrl(entry.url)}
                  </span>
                  {entry.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retryUrl(i)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title="Retry"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {entry.status === "ready" && entry.size != null && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <span className="text-xs text-muted-foreground">
            {hasResults && !importing
              ? format(t.urlImport.readyCount, { ready: readyCount, total: entries.length })
              : ""}
          </span>
          <div className="flex items-center gap-2">
            {hasResults && !importing ? (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={readyCount === 0 || adding}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {t.urlImport.adding}
                    </>
                  ) : (
                    format(t.urlImport.addButton, { count: readyCount })
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={text.trim().length === 0 || importing}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {t.urlImport.adding}
                    </>
                  ) : (
                    t.urlImport.importButton
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
