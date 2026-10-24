import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Check, ClipboardCopy, Copy, Loader2, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { useTimeouts } from "@/hooks/use-timeouts";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

type ColorFormat = "hex" | "rgb" | "hsl";

interface ExtractedPalette {
  colors: string[];
  hexColors: string[];
}

interface ColorPaletteResponse {
  colors: string[];
  hex: string[];
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function isColorPaletteResponse(value: unknown): value is ColorPaletteResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    isNonEmptyStringArray(data.colors) &&
    isNonEmptyStringArray(data.hex) &&
    data.colors.length === data.hex.length
  );
}

const FALLBACK_ENTRY_KEY = "__default__";

export function ColorPaletteSettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["color-palette"];
  const { entries, selectedIndex, files, processing, error, setProcessing, setError } =
    useFileStore();
  const [count, setCount] = useState(8);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [palettesByEntry, setPalettesByEntry] = useState<Record<string, ExtractedPalette>>({});
  const [swatchCopy, setSwatchCopy] = useState<{ idx: number; ok: boolean } | null>(null);
  const [exportCopy, setExportCopy] = useState<{ kind: "css" | "json"; ok: boolean } | null>(null);
  const later = useTimeouts();
  const abortRef = useRef<AbortController | null>(null);

  const selectedEntry = entries[selectedIndex] ?? entries[0];
  const activeEntryKey = selectedEntry?.id ?? FALLBACK_ENTRY_KEY;
  const activePalette = palettesByEntry[activeEntryKey];
  const colors = activePalette?.colors ?? [];
  const hexColors = activePalette?.hexColors ?? [];

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const handleProcess = async () => {
    const { entries: currentEntries, selectedIndex, files: currentFiles } = useFileStore.getState();
    const capturedEntry = currentEntries[selectedIndex] ?? currentEntries[0];
    const targetFile = capturedEntry?.file ?? currentFiles[0];
    if (!targetFile) return;
    const targetEntryKey = capturedEntry?.id ?? FALLBACK_ENTRY_KEY;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "color-palette",
      is_batch: false,
      file_count: 1,
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setPalettesByEntry((prev) => {
      if (!(targetEntryKey in prev)) return prev;
      const next = { ...prev };
      delete next[targetEntryKey];
      return next;
    });

    let storeReset = false;
    const unsubscribe = useFileStore.subscribe((state) => {
      const hasCapturedEntry = capturedEntry
        ? state.entries.some((e) => e.id === capturedEntry.id && e.file === capturedEntry.file)
        : state.files.includes(targetFile);
      if (!state.processing || !hasCapturedEntry) {
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
      formData.append("file", targetFile);
      formData.append("settings", JSON.stringify({ count, format }));

      const res = await fetch(appUrl("/api/v1/tools/image/color-palette"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(failedAnswerMessage(t, body, res.status, `Failed: ${res.status}`));
      }

      const data = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (controller.signal.aborted || storeReset) return;
      if (!isColorPaletteResponse(data)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      setPalettesByEntry((prev) => ({
        ...prev,
        [targetEntryKey]: { colors: data.colors, hexColors: data.hex },
      }));
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      setError(err instanceof Error ? err.message : ts.extracting);
    } finally {
      unsubscribe();
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  };

  const copyColor = async (color: string, idx: number) => {
    const ok = await copyToClipboard(color);
    setSwatchCopy({ idx, ok });
    later(() => setSwatchCopy(null), 1500, "swatchCopy");
  };

  const copyExport = async (kind: "css" | "json", text: string) => {
    const ok = await copyToClipboard(text);
    setExportCopy({ kind, ok });
    later(() => setExportCopy(null), 1500, "exportCopy");
  };

  const copyCss = () => {
    const vars = hexColors.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n");
    return copyExport("css", `:root {\n${vars}\n}`);
  };

  const copyJson = () => copyExport("json", JSON.stringify(colors));

  /** The tick, the cross, or the idle icon for one copy control. */
  const copyIcon = (result: { ok: boolean } | null, idle: ReactNode) =>
    result === null ? (
      idle
    ) : result.ok ? (
      <Check className="h-3 w-3 text-success-ink shrink-0" />
    ) : (
      <X className="h-3 w-3 text-destructive shrink-0" />
    );

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Color count slider */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{ts.colors}</span>
          <span className="text-xs font-mono text-foreground">{count}</span>
        </div>
        <input
          type="range"
          min={2}
          max={16}
          step={1}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full mt-1"
          data-testid="color-palette-count"
        />
      </div>

      {/* Format toggle */}
      <div>
        <span className="text-xs text-muted-foreground">{ts.format}</span>
        <div className="flex gap-1 mt-1">
          {(["hex", "rgb", "hsl"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`flex-1 text-xs py-1.5 rounded ${format === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              data-testid={`color-palette-format-${f}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Extract button */}
      <button
        type="button"
        data-testid="color-palette-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? ts.extracting : ts.submit}
      </button>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {colors.length > 0 && (
        <div className="space-y-3">
          {/* Full-width palette strip */}
          <div
            className="flex h-10 rounded overflow-hidden border border-border"
            data-testid="color-palette-strip"
          >
            {hexColors.map((hex) => (
              <div key={hex} className="flex-1" style={{ backgroundColor: hex }} />
            ))}
          </div>

          {/* Header + export buttons */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {ts.dominantColors} ({colors.length})
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={copyCss}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                data-testid="color-palette-copy-css"
                title={
                  exportCopy?.kind === "css" && !exportCopy.ok ? t.common.copyFailed : undefined
                }
              >
                {copyIcon(
                  exportCopy?.kind === "css" ? exportCopy : null,
                  <ClipboardCopy className="h-3 w-3" />,
                )}
                CSS
              </button>
              <button
                type="button"
                onClick={copyJson}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                data-testid="color-palette-copy-json"
                title={
                  exportCopy?.kind === "json" && !exportCopy.ok ? t.common.copyFailed : undefined
                }
              >
                {copyIcon(
                  exportCopy?.kind === "json" ? exportCopy : null,
                  <ClipboardCopy className="h-3 w-3" />,
                )}
                JSON
              </button>
            </div>
          </div>

          {/* Swatch list */}
          <div className="grid grid-cols-2 gap-1.5">
            {colors.map((color, i) => (
              <button
                type="button"
                key={hexColors[i]}
                onClick={() => copyColor(color, i)}
                className="flex items-center gap-2 p-1.5 rounded border border-border hover:bg-muted transition-colors"
                title={swatchCopy?.idx === i && !swatchCopy.ok ? t.common.copyFailed : undefined}
              >
                <div
                  className="w-6 h-6 rounded border border-border shrink-0"
                  style={{ backgroundColor: hexColors[i] }}
                />
                <span className="text-xs font-mono text-foreground flex-1 text-start truncate">
                  {color}
                </span>
                {copyIcon(
                  swatchCopy?.idx === i ? swatchCopy : null,
                  <Copy className="h-3 w-3 text-muted-foreground shrink-0" />,
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
