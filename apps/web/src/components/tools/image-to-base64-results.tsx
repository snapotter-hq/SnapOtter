import { Check, ClipboardCopy, Download, FileJson, FileText, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { copyToClipboard } from "@/lib/utils";
import type { Base64Result } from "@/stores/base64-store";
import { useBase64Store } from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";

// -- Snippet generators -----------------------------------------------------

type TabId = "datauri" | "raw" | "html" | "css" | "json" | "markdown";

interface Tab {
  id: TabId;
  generate: (r: Base64Result) => string;
}

const TABS: Tab[] = [
  { id: "datauri", generate: (r) => r.dataUri },
  { id: "raw", generate: (r) => r.base64 },
  {
    id: "html",
    generate: (r) => {
      const alt = r.filename.replace(/\.[^.]+$/, "");
      return `<img src="${r.dataUri}" alt="${alt}" />`;
    },
  },
  {
    id: "css",
    generate: (r) => `background-image: url(${r.dataUri});`,
  },
  {
    id: "json",
    generate: (r) => JSON.stringify({ image: r.dataUri }, null, 2),
  },
  {
    id: "markdown",
    generate: (r) => {
      const alt = r.filename.replace(/\.[^.]+$/, "");
      return `![${alt}](${r.dataUri})`;
    },
  },
];

// -- Helpers ----------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// -- CopyButton -------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = useCallback(async () => {
    // copyToClipboard falls back to execCommand on plain-http installs, where
    // navigator.clipboard does not exist (Sentry WEB-G).
    const ok = await copyToClipboard(text);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus("idle"), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
    >
      {status === "copied" ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ClipboardCopy className="h-3.5 w-3.5" />
      )}
      {status === "copied"
        ? t.common.copied
        : status === "failed"
          ? t.toolSettings["image-to-base64-results"].copyFailed
          : (label ?? t.common.copy)}
    </button>
  );
}

// -- Single file result view ------------------------------------------------

function FileResult({ result }: { result: Base64Result }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("datauri");
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const output = tab.generate(result);
  // HTML/CSS/JSON/Markdown are format names and stay untranslated.
  const tabLabels: Record<TabId, string> = {
    datauri: t.toolSettings["image-to-base64-results"].tabDataUri,
    raw: t.toolSettings["image-to-base64-results"].tabRawBase64,
    html: "HTML",
    css: "CSS",
    json: "JSON",
    markdown: "Markdown",
  };

  const handleDownload = useCallback(() => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.filename}.base64.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, result.filename]);

  return (
    <div className="flex flex-col h-full">
      {/* Metadata */}
      <div className="flex items-center gap-3 mb-3">
        <img
          src={result.dataUri}
          alt={result.filename}
          className="w-12 h-12 rounded-md object-cover bg-muted flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{result.filename}</p>
          <p className="text-[11px] text-muted-foreground">
            {result.width}x{result.height} &middot; {formatBytes(result.originalSize)} &rarr;{" "}
            {formatBytes(result.encodedSize)}{" "}
            <span
              className={result.overheadPercent > 50 ? "text-amber-700 dark:text-amber-400" : ""}
            >
              (+{result.overheadPercent}%)
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? "text-primary-ink border-b-2 border-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tabLabels[t.id]}
          </button>
        ))}
      </div>

      {/* Code output */}
      <div className="flex-1 min-h-0 bg-muted rounded-md p-3 overflow-auto">
        <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
          {output}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <CopyButton
          text={output}
          label={t.toolSettings["image-to-base64-results"].copyToClipboard}
        />
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {t.toolSettings["image-to-base64-results"].downloadTxt}
        </button>
      </div>
    </div>
  );
}

// -- Main ResultsPanel ------------------------------------------------------

export function ImageToBase64Results() {
  const { t } = useTranslation();
  const ts = t.toolSettings["image-to-base64-results"];
  const { results, errors, processing, progress } = useBase64Store();
  const { entries, selectedIndex, originalBlobUrl, selectedFileName } = useFileStore();

  // -- Processing state: progress bar --
  if (processing) {
    const pct =
      progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 w-72 max-w-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          {progress ? (
            <>
              <p className="text-sm text-muted-foreground text-center truncate w-full">
                {ts.converting}{" "}
                <span className="font-medium text-foreground">{progress.currentFile}</span>
              </p>
              <div className="w-full">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                  {format(ts.completedOfTotalFiles, {
                    completed: progress.completed,
                    total: progress.total,
                  })}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{ts.startingConversion}</p>
          )}
        </div>
      </div>
    );
  }

  // -- No results yet: show preview of selected image --
  if (results.length === 0 && errors.length === 0) {
    if (originalBlobUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <img
            src={originalBlobUrl}
            alt={selectedFileName ?? ts.preview}
            className="max-h-[60%] max-w-full rounded-lg object-contain bg-muted"
          />
          <p className="text-sm text-muted-foreground text-center">
            {entries.length > 1
              ? format(ts.filesReadyClickConvert, { count: entries.length })
              : ts.clickConvertToConvert}
          </p>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">{ts.uploadImagesAndClickConvert}</p>
      </div>
    );
  }

  // -- Results ready: find result for the currently selected file --
  const currentFileName = entries[selectedIndex]?.file.name ?? null;
  const currentResult = currentFileName
    ? results.find((r) => r.filename === currentFileName)
    : null;
  const currentError = currentFileName ? errors.find((e) => e.filename === currentFileName) : null;

  const hasMultiple = entries.length > 1;

  return (
    <div className="p-4 flex flex-col h-full">
      {/* Batch summary bar */}
      {hasMultiple && (
        <div className="mb-3 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              {errors.length > 0
                ? format(ts.convertedOfTotalWithFailed, {
                    done: results.length,
                    total: entries.length,
                    count: errors.length,
                  })
                : format(ts.convertedOfTotal, { done: results.length, total: entries.length })}
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <CopyButton
              text={JSON.stringify(
                results.map((r) => r.dataUri),
                null,
                2,
              )}
              label={ts.copyAllAsJson}
            />
            <button
              type="button"
              onClick={() => {
                const json = JSON.stringify(
                  results.map((r) => ({
                    filename: r.filename,
                    mimeType: r.mimeType,
                    width: r.width,
                    height: r.height,
                    dataUri: r.dataUri,
                  })),
                  null,
                  2,
                );
                downloadFile(json, "base64-all.json", "application/json");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <FileJson className="h-3.5 w-3.5" />
              {ts.downloadAllAsJson}
            </button>
            <button
              type="button"
              onClick={() => {
                const lines = results
                  .map((r) => `--- ${r.filename} ---\n${r.dataUri}\n`)
                  .join("\n");
                downloadFile(lines, "base64-all.txt", "text/plain");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              {ts.downloadAllAsText}
            </button>
          </div>
        </div>
      )}

      {/* Current file result */}
      <div className="flex-1 min-h-0">
        {currentResult ? (
          <FileResult result={currentResult} />
        ) : currentError ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-destructive-ink font-medium mb-1">
                {currentError.filename}
              </p>
              <p className="text-xs text-destructive-ink">{currentError.error}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">{ts.noResultForThisFile}</p>
          </div>
        )}
      </div>
    </div>
  );
}
