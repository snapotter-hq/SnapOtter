import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyFeedback } from "@/components/common/copy-feedback";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders, userErrorMessage } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { copyToClipboard } from "@/lib/utils";

// Same ids as PROPORTION_MODES in apps/api/src/lib/proportion.ts.
const MODES = ["direct", "inverse"] as const;
type Mode = (typeof MODES)[number];

const FIELDS = ["a", "b", "c"] as const;
type Field = (typeof FIELDS)[number];

const INPUT_CLASS =
  "w-full mt-1 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground aria-[invalid=true]:border-destructive";

// A plain decimal with either "." or "," as the separator (so "1,5" works for
// locales that write it that way) and an optional exponent. No thousands
// separators: "1,000" would be ambiguous.
const NUMBER_PATTERN = /^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?$/i;

// Arabic-Indic, Extended Arabic-Indic (Persian/Urdu) and Devanagari digits, so
// an Arabic or Hindi keyboard works too.
const NATIVE_DIGIT = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;
const NATIVE_ZEROS = [0x0660, 0x06f0, 0x0966];
const ARABIC_DECIMAL_SEPARATOR = /\u066b/g;

function toAsciiDigits(text: string): string {
  return text
    .replace(NATIVE_DIGIT, (ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      const zero = NATIVE_ZEROS.find((z) => cp >= z && cp <= z + 9) ?? cp;
      return String(cp - zero);
    })
    .replace(ARABIC_DECIMAL_SEPARATOR, ".");
}

export function parseNumberInput(raw: string): number | null {
  const trimmed = toAsciiDigits(raw.trim());
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function isProportionResponse(value: unknown): value is { x: number } {
  return (
    !!value && typeof value === "object" && typeof (value as Record<string, unknown>).x === "number"
  );
}

export function ProportionCalculatorSettings() {
  const { t, locale } = useTranslation();
  const ts = t.toolSettings["proportion-calculator"];
  const [values, setValues] = useState<Record<Field, string>>({ a: "", b: "", c: "" });
  const [mode, setMode] = useState<Mode>("direct");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copy, setCopy] = useState<{ ok: boolean } | null>(null);
  const later = useTimeouts();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const numbers = {
    a: parseNumberInput(values.a),
    b: parseNumberInput(values.b),
    c: parseNumberInput(values.c),
  };
  const zeroDivisor = mode === "direct" ? numbers.a === 0 : numbers.c === 0;
  const ready = FIELDS.every((f) => numbers[f] !== null) && !zeroDivisor;

  // Any edit makes a shown result (or one still on its way) answer a question
  // nobody is asking any more, so drop it rather than leave it to be copied.
  const discardResult = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProcessing(false);
    setCopy(null);
    setResult(null);
    setError(null);
  };

  const calculate = async () => {
    if (!ready) return;
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "proportion-calculator",
      is_batch: false,
      file_count: 0,
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(appUrl("/api/v1/tools/files/proportion-calculator"), {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...numbers, mode }),
        signal: controller.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(
          failedAnswerMessage(t, data, res.status, t.errors.processingFailedNoDetail),
        );
      }
      if (!isProportionResponse(data)) throw new Error(t.errors.invalidServerResponse);
      setResult(
        new Intl.NumberFormat(locale, { maximumSignificantDigits: 15, useGrouping: false }).format(
          data.x,
        ),
      );
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
    if (ok) track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: "proportion-calculator" });
    setCopy({ ok });
    later(() => setCopy(null), 1500, "copy");
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void calculate();
      }}
    >
      <fieldset>
        <legend className="text-xs text-muted-foreground mb-1">{ts.modeLabel}</legend>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => {
                if (m === mode) return;
                discardResult();
                setMode(m);
              }}
              aria-pressed={mode === m}
              className={`flex-1 text-xs py-1.5 rounded ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              data-testid={`proportion-mode-${m}`}
            >
              {ts[m]}
            </button>
          ))}
        </div>
        <p
          id="proportion-hint"
          className="mt-1 text-xs text-muted-foreground"
          data-testid="proportion-hint"
        >
          {mode === "direct" ? ts.directHint : ts.inverseHint}
        </p>
      </fieldset>

      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map((f) => {
          const id = `proportion-${f}`;
          const invalid = values[f].trim() !== "" && numbers[f] === null;
          return (
            <div key={f}>
              <label htmlFor={id} className="text-xs text-muted-foreground">
                {f.toUpperCase()}
              </label>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values[f]}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [f]: e.target.value }));
                  discardResult();
                }}
                aria-invalid={invalid}
                aria-describedby={invalid ? `proportion-hint ${id}-error` : "proportion-hint"}
                className={INPUT_CLASS}
                data-testid={id}
              />
              {invalid && (
                <p id={`${id}-error`} className="mt-1 text-xs text-destructive-ink">
                  {ts.invalidNumber}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {zeroDivisor && (
        <p className="text-xs text-destructive-ink" role="alert" data-testid="proportion-zero">
          {mode === "direct" ? ts.zeroDivisorDirect : ts.zeroDivisorInverse}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || processing}
        className="w-full flex items-center justify-center gap-1 text-sm py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="proportion-calculate"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {ts.calculate}
      </button>

      {error && (
        <p className="text-xs text-destructive-ink" role="alert" data-testid="proportion-error">
          {error}
        </p>
      )}

      {/* Mounted before any answer so screen readers announce each new one. */}
      <div aria-live="polite">
        {result !== null && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{ts.result}</span>
              <button
                type="button"
                onClick={copyResult}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                data-testid="proportion-copy"
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
            <p
              className="mt-1 px-2 py-1.5 rounded border border-border bg-muted text-lg font-mono text-foreground break-all"
              data-testid="proportion-result"
            >
              X = {result}
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
