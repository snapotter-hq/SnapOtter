import { ANALYTICS_EVENTS, CONVERT_CASE_MAX_CHARS } from "@snapotter/shared";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyFeedback } from "@/components/common/copy-feedback";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders, userErrorMessage } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { copyToClipboard } from "@/lib/utils";

// Same order and ids as CASE_MODES in apps/api/src/lib/convert-case.ts.
const MODES = [
  "upper",
  "lower",
  "sentence",
  "title",
  "capitalized",
  "inverse",
  "alternating",
  "camel",
  "pascal",
  "snake",
  "kebab",
] as const;

type Mode = (typeof MODES)[number];

const TEXTAREA_CLASS =
  "w-full mt-1 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground resize-y";

function isConvertCaseResponse(value: unknown): value is { result: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).result === "string"
  );
}

export function ConvertCaseSettings() {
  const { t, locale } = useTranslation();
  const ts = t.toolSettings["convert-case"];
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Mode | null>(null);
  const [copy, setCopy] = useState<{ ok: boolean } | null>(null);
  const later = useTimeouts();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const convert = async (mode: Mode) => {
    if (!input) return;
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "convert-case",
      is_batch: false,
      file_count: 0,
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(mode);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(appUrl("/api/v1/tools/files/convert-case"), {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        // The UI language is the best guess at the text's language, which
        // decides letters like the Turkish dotted and dotless i.
        body: JSON.stringify({ text: input, mode, locale }),
        signal: controller.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(
          failedAnswerMessage(t, data, res.status, t.errors.processingFailedNoDetail),
        );
      }
      if (!isConvertCaseResponse(data)) throw new Error(t.errors.invalidServerResponse);
      setResult(data.result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(userErrorMessage(t, err, t.errors.processingFailedNoDetail));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProcessing(null);
      }
    }
  };

  const copyResult = async () => {
    if (result === null) return;
    const ok = await copyToClipboard(result);
    setCopy({ ok });
    later(() => setCopy(null), 1500, "copy");
  };

  const inputId = "convert-case-input";
  const resultId = "convert-case-result";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {ts.input}
        </label>
        <textarea
          id={inputId}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setResult(null);
          }}
          placeholder={ts.placeholder}
          maxLength={CONVERT_CASE_MAX_CHARS}
          rows={6}
          className={TEXTAREA_CLASS}
          data-testid="convert-case-input"
        />
      </div>

      <fieldset>
        <legend className="text-xs text-muted-foreground mb-1">{ts.chooseCase}</legend>
        <div className="grid grid-cols-2 gap-1">
          {MODES.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => convert(m)}
              disabled={!input || processing !== null}
              className="flex items-center justify-center gap-1 text-xs py-1.5 rounded bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`convert-case-mode-${m}`}
            >
              {processing === m && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              {ts.modes[m]}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="text-xs text-destructive-ink" role="alert" data-testid="convert-case-error">
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
              data-testid="convert-case-copy"
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
            className={TEXTAREA_CLASS}
            data-testid="convert-case-result"
          />
        </div>
      )}
    </div>
  );
}
