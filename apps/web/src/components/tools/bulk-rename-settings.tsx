import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const APFS_CASE_FOLDS: Record<string, string> = {
  "\u{00b5}": "\u{03bc}",
  "\u{00df}": "ss",
  "\u{0149}": "\u{02bc}n",
  "\u{017f}": "s",
  "\u{0345}": "\u{03b9}",
  "\u{03c2}": "\u{03c3}",
  "\u{03d0}": "\u{03b2}",
  "\u{03d1}": "\u{03b8}",
  "\u{03d5}": "\u{03c6}",
  "\u{03d6}": "\u{03c0}",
  "\u{03f0}": "\u{03ba}",
  "\u{03f1}": "\u{03c1}",
  "\u{03f5}": "\u{03b5}",
  "\u{0587}": "\u{0565}\u{0582}",
  "\u{1c80}": "\u{0432}",
  "\u{1c81}": "\u{0434}",
  "\u{1c82}": "\u{043e}",
  "\u{1c83}": "\u{0441}",
  "\u{1c84}": "\u{0442}",
  "\u{1c85}": "\u{0442}",
  "\u{1c86}": "\u{044a}",
  "\u{1c87}": "\u{0463}",
  "\u{1c88}": "\u{a64b}",
  "\u{1e9a}": "a\u{02be}",
  "\u{fb00}": "ff",
  "\u{fb01}": "fi",
  "\u{fb02}": "fl",
  "\u{fb03}": "ffi",
  "\u{fb04}": "ffl",
  "\u{fb05}": "st",
  "\u{fb06}": "st",
  "\u{fb13}": "\u{0574}\u{0576}",
  "\u{fb14}": "\u{0574}\u{0565}",
  "\u{fb15}": "\u{0574}\u{056b}",
  "\u{fb16}": "\u{057e}\u{0576}",
  "\u{fb17}": "\u{0574}\u{056d}",
};
const APFS_CASE_FOLD_RE =
  /(?:[\u{00b5}\u{00df}\u{0149}\u{017f}\u{03c2}\u{03d0}\u{03d1}\u{03d5}\u{03d6}\u{03f0}\u{03f1}\u{03f5}\u{0587}\u{1c80}-\u{1c88}\u{1e9a}\u{fb00}-\u{fb06}\u{fb13}-\u{fb17}]|\u{0345})/gu;

function createUniqueNamer(): (name: string) => string {
  const used = new Set<string>();
  const key = (name: string) =>
    name
      .normalize("NFD")
      .toLowerCase()
      .replace(APFS_CASE_FOLD_RE, (ch) => APFS_CASE_FOLDS[ch]);
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
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "bulk-rename",
      is_batch: false,
      file_count: files.length,
    });
    const startEntries = useFileStore.getState().entries;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setDownloadReady(false);

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      const hasRunEntry =
        startEntries.length > 0
          ? startEntries.every((b) => state.entries.some((e) => e.id === b.id && e.file === b.file))
          : state.entries.length > 0;
      if (!state.processing || !hasRunEntry) {
        storeReset = true;
        if (abortRef.current === controller) abortRef.current = null;
        unsubscribe();
        if (state.processing) {
          setProcessing(false);
        }
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
