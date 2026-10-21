import { Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

function createUniqueNamer(): (name: string) => string {
  const used = new Set<string>();
  const key = (name: string) => name.normalize("NFC").toLowerCase();
  return (name) => {
    if (!used.has(key(name))) {
      used.add(key(name));
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let counter = 1;
    while (used.has(key(`${base}_${counter}${ext}`))) counter++;
    const candidate = `${base}_${counter}${ext}`;
    used.add(key(candidate));
    return candidate;
  };
}

export function BulkRenameSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [pattern, setPattern] = useState("file-{{index}}");
  const [startIndex, setStartIndex] = useState(1);
  const [downloadReady, setDownloadReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const handleProcess = async () => {
    if (files.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setDownloadReady(false);

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (!state.processing || state.entries.length === 0) {
        storeReset = true;
        if (abortRef.current === controller) abortRef.current = null;
        unsubscribe();
        controller.abort();
      }
    });

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append("settings", JSON.stringify({ pattern, startIndex }));

      const res = await fetch(appUrl("/api/v1/tools/image/bulk-rename"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          failedAnswerMessage(
            t,
            body,
            res.status,
            format(t.errors.failedWithStatus, { status: res.status }),
          ),
        );
      }

      const blob = await res.blob();
      if (controller.signal.aborted || storeReset) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "renamed.zip";
      a.click();
      URL.revokeObjectURL(url);
      setDownloadReady(true);
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      setError(err instanceof Error ? err.message : t.toolSettings["bulk-rename"].renameFailed);
    } finally {
      unsubscribe();
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  };

  const hasFiles = files.length > 0;

  // Preview names
  const uniqueName = createUniqueNamer();
  const previewNames = hasFiles
    ? files.slice(0, 5).map((f, i) => {
        const dotIdx = f.name.lastIndexOf(".");
        const ext = dotIdx > 0 ? f.name.slice(dotIdx) : "";
        const stem = ext ? f.name.slice(0, -ext.length) : f.name;
        const idx = startIndex + i;
        const padded = String(idx).padStart(String(files.length + startIndex).length, "0");
        return uniqueName(
          pattern
            .replace(/\{\{index\}\}/g, String(idx))
            .replace(/\{\{padded\}\}/g, padded)
            .replace(/\{\{original\}\}/g, () => stem) + ext,
        );
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bulk-rename-pattern" className="text-xs text-muted-foreground">
          {t.toolSettings["bulk-rename"].pattern}
        </label>
        <input
          id="bulk-rename-pattern"
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {t.toolSettings["bulk-rename"].patternHint}
        </p>
      </div>

      <div>
        <label htmlFor="bulk-rename-start-index" className="text-xs text-muted-foreground">
          {t.toolSettings["bulk-rename"].startIndex}
        </label>
        <input
          id="bulk-rename-start-index"
          type="number"
          value={startIndex}
          onChange={(e) => setStartIndex(Number(e.target.value))}
          min={0}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {previewNames.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">{t.toolSettings["bulk-rename"].preview}</p>
          <div className="mt-1 space-y-0.5">
            {previewNames.map((name) => (
              <div
                key={name}
                className="text-xs font-mono text-foreground bg-muted px-2 py-0.5 rounded truncate"
              >
                {name}
              </div>
            ))}
            {files.length > 5 && (
              <p className="text-[10px] text-muted-foreground">
                {format(t.toolSettings["bulk-rename"].andMore, { count: files.length - 5 })}
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      <button
        type="button"
        data-testid="bulk-rename-submit"
        onClick={handleProcess}
        disabled={!hasFiles || processing || !pattern}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing
          ? t.toolSettings["bulk-rename"].renaming
          : format(t.toolSettings["bulk-rename"].submit, { count: files.length })}
      </button>

      {downloadReady && (
        <p className="text-xs text-success-ink flex items-center gap-1">
          <Download className="h-3 w-3" /> {t.toolSettings["bulk-rename"].zipDownloaded}
        </p>
      )}
    </div>
  );
}
