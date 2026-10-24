import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const BARCODE_TYPES = [
  { value: "code128", label: "Code 128" },
  { value: "ean13", label: "EAN-13" },
  { value: "upca", label: "UPC-A" },
  { value: "code39", label: "Code 39" },
  { value: "itf14", label: "ITF-14" },
  { value: "datamatrix", label: "Data Matrix" },
] as const;

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

interface BarcodeGenerateResponse {
  downloadUrl: string;
}

function isBarcodeGenerateResponse(value: unknown): value is BarcodeGenerateResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.downloadUrl === "string" && data.downloadUrl.length > 0;
}

export function BarcodeGenerateSettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["barcode-generate"];
  const { processing, error, setProcessing, setError } = useFileStore();

  const [text, setText] = useState("");
  const [type, setType] = useState("code128");
  const [scale, setScale] = useState(3);
  const [includeText, setIncludeText] = useState(true);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const canGenerate = text.trim().length > 0 && !processing;

  const handleGenerate = useCallback(async () => {
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "barcode-generate",
      is_batch: false,
      file_count: 1,
    });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    setResultUrl(null);

    let storeReset = false;
    const startStopCount = useFileStore.getState().stopCount;
    const unsubscribe = useFileStore.subscribe((state) => {
      if (!state.processing || state.stopCount !== startStopCount) {
        storeReset = true;
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        unsubscribe();
        if (state.processing) {
          setProcessing(false);
        }
        controller.abort();
      }
    });
    controller.signal.addEventListener("abort", unsubscribe, { once: true });

    try {
      const res = await fetch(appUrl("/api/v1/tools/image/barcode-generate"), {
        method: "POST",
        headers: {
          ...formatHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim(), type, scale, includeText }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          failedAnswerMessage(
            t,
            body,
            res.status,
            format(t.errors.requestFailedWithStatus, { status: res.status }),
          ),
        );
      }

      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (controller.signal.aborted || storeReset) return;
      const data = resolveServerUrls(raw);
      if (!isBarcodeGenerateResponse(data)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      setResultUrl(data.downloadUrl);
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      setError(err instanceof Error ? err.message : ts.generateFailed);
    } finally {
      unsubscribe();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  }, [text, type, scale, includeText, setProcessing, setError, t, ts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canGenerate) handleGenerate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Text input */}
      <div>
        <label htmlFor="barcode-text" className="text-xs text-muted-foreground">
          {ts.text}
        </label>
        <input
          id="barcode-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ts.enterTextOrNumber}
          className={INPUT_CLASS}
          data-testid="barcode-input-text"
        />
      </div>

      {/* Barcode Type */}
      <div>
        <label htmlFor="barcode-type" className="text-xs text-muted-foreground">
          {ts.type}
        </label>
        <select
          id="barcode-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={INPUT_CLASS}
        >
          {BARCODE_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {bt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Scale */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="barcode-scale" className="text-xs text-muted-foreground">
            {ts.scale}
          </label>
          <span className="text-xs font-mono text-foreground">{scale}x</span>
        </div>
        <input
          id="barcode-scale"
          type="range"
          min={1}
          max={8}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Include Text */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={includeText}
          onChange={(e) => setIncludeText(e.target.checked)}
          className="rounded border-border"
        />
        {ts.includeText}
      </label>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Result preview */}
      {resultUrl && (
        <div className="space-y-2">
          <img
            src={resultUrl}
            alt={ts.generatedBarcode}
            className="w-full rounded border border-border bg-white p-2"
          />
          <a
            href={resultUrl}
            download="barcode.png"
            data-testid="barcode-generate-download"
            className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            {ts.download}
          </a>
        </div>
      )}

      {/* Generate button */}
      <button
        type="submit"
        data-testid="barcode-generate-submit"
        disabled={!canGenerate}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {ts.submit}
      </button>
    </form>
  );
}
