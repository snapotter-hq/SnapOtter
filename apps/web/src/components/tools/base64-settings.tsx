import { ANALYTICS_EVENTS, BASE64_TEXT_MAX_CHARS } from "@snapotter/shared";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyFeedback } from "@/components/common/copy-feedback";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders, userErrorMessage } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
import { copyToClipboard } from "@/lib/utils";

type Mode = "encode" | "decode";

const TEXTAREA_CLASS =
  "w-full mt-1 px-2 py-1.5 rounded border border-border bg-background text-sm font-mono text-foreground resize-y break-all";

function isBase64Response(value: unknown): value is { result: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).result === "string"
  );
}

export function Base64Settings() {
  const { t } = useTranslation();
  const ts = t.toolSettings.base64;
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copy, setCopy] = useState<{ ok: boolean } | null>(null);
  const later = useTimeouts();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const tooLong = input.length > BASE64_TEXT_MAX_CHARS;

  // Any edit makes a shown result (or one still on its way) answer a question
  // nobody is asking any more, so drop it rather than leave it to be copied.
  const discardResult = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProcessing(false);
    setResult(null);
    setError(null);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    discardResult();
    setMode(next);
  };

  const handleProcess = async () => {
    if (!input || tooLong) return;
    track(ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "base64", is_batch: false, file_count: 0 });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(appUrl("/api/v1/tools/files/base64"), {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: input, mode, urlSafe: mode === "encode" && urlSafe }),
        signal: controller.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(
          failedAnswerMessage(t, data, res.status, t.errors.processingFailedNoDetail),
        );
      }
      if (!isBase64Response(data)) throw new Error(t.errors.invalidServerResponse);
      setResult(data.result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(userErrorMessage(t, err, t.errors.processingFailedNoDetail));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProcessing(false);
      }
    }
  };

  const copyResult = async () => {
    if (result === null) return;
    const ok = await copyToClipboard(result);
    if (ok) track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: "base64" });
    setCopy({ ok });
    later(() => setCopy(null), 1500, "copy");
  };

  const inputId = "base64-input";
  const resultId = "base64-result";

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["encode", "decode"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={`flex-1 text-xs py-1.5 rounded ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            data-testid={`base64-text-mode-${m}`}
          >
            {ts[m]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {mode === "encode" ? ts.encodeInput : ts.decodeInput}
        </label>
        <textarea
          id={inputId}
          value={input}
          onChange={(e) => {
            discardResult();
            setInput(e.target.value);
          }}
          placeholder={mode === "encode" ? ts.encodePlaceholder : ts.decodePlaceholder}
          aria-invalid={tooLong || undefined}
          rows={6}
          spellCheck={false}
          className={TEXTAREA_CLASS}
          data-testid="base64-text-input"
        />
      </div>

      {tooLong && (
        <p className="text-xs text-destructive-ink" role="alert" data-testid="base64-text-too-long">
          {format(ts.tooLong, {
            count: input.length.toLocaleString(),
            max: BASE64_TEXT_MAX_CHARS.toLocaleString(),
          })}
        </p>
      )}

      {mode === "encode" && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={urlSafe}
            onChange={(e) => {
              discardResult();
              setUrlSafe(e.target.checked);
            }}
            className="rounded border-border"
            data-testid="base64-text-url-safe"
          />
          {ts.urlSafe}
        </label>
      )}

      <button
        type="button"
        data-testid="base64-text-submit"
        onClick={handleProcess}
        disabled={!input || tooLong || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? ts.converting : ts[mode]}
      </button>

      {error && (
        <p className="text-xs text-destructive-ink" role="alert" data-testid="base64-text-error">
          {error}
        </p>
      )}

      {result !== null && (
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor={resultId} className="text-xs text-muted-foreground">
              {ts.result}
            </label>
            <button
              type="button"
              onClick={copyResult}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
              data-testid="base64-text-copy"
              title={copy && !copy.ok ? t.common.copyFailed : undefined}
            >
              {copy === null ? (
                <Copy className="h-3 w-3" />
              ) : copy.ok ? (
                <Check className="h-3 w-3 text-success-ink" />
              ) : (
                <X className="h-3 w-3 text-destructive" />
              )}
              {t.common.copy}
            </button>
            <CopyFeedback status={copy} />
          </div>
          <textarea
            id={resultId}
            value={result}
            readOnly
            rows={6}
            spellCheck={false}
            className={TEXTAREA_CLASS}
            data-testid="base64-text-result"
          />
        </div>
      )}
    </div>
  );
}
