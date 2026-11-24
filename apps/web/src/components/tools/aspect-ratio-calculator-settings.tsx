import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useSettleOnUnmount } from "@/hooks/use-settle-on-unmount";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders, userErrorMessage } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const PRESETS = [
  [16, 9],
  [4, 3],
  [3, 2],
  [1, 1],
  [21, 9],
  [9, 16],
  [4, 5],
] as const;

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

type Side = "width" | "height";

interface AspectRatioResponse {
  ratio: string;
  newWidth: number | null;
  newHeight: number | null;
}

function isAspectRatioResponse(value: unknown): value is AspectRatioResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const isDimension = (v: unknown) => v === null || typeof v === "number";
  return (
    typeof data.ratio === "string" &&
    data.ratio.length > 0 &&
    isDimension(data.newWidth) &&
    isDimension(data.newHeight)
  );
}

function parseDimension(value: string): number | undefined {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function AspectRatioCalculatorSettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["aspect-ratio-calculator"];
  const { processing, error, setProcessing, setError } = useFileStore();

  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [newWidth, setNewWidth] = useState("");
  const [newHeight, setNewHeight] = useState("");
  // The new dimension the user typed last is the one the server solves from;
  // the other is the answer and gets overwritten.
  const [driver, setDriver] = useState<Side | null>(null);
  const [round, setRound] = useState(true);
  const [ratio, setRatio] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useSettleOnUnmount(
    () => abortRef.current !== null,
    () => abortRef.current?.abort(),
  );

  const parsedWidth = parseDimension(width);
  const parsedHeight = parseDimension(height);
  const target =
    driver === "width"
      ? parseDimension(newWidth)
      : driver === "height"
        ? parseDimension(newHeight)
        : undefined;
  const canCalculate =
    parsedWidth !== undefined &&
    parsedHeight !== undefined &&
    (driver === null || target !== undefined) &&
    !processing;

  const editOriginal = (side: Side, value: string) => {
    if (side === "width") setWidth(value);
    else setHeight(value);
    setRatio(null);
    // The solved value belonged to the old size, so it would now be wrong.
    if (driver === "width") setNewHeight("");
    if (driver === "height") setNewWidth("");
  };

  const editTarget = (side: Side, value: string) => {
    // Clearing the field goes back to asking for the ratio alone.
    setDriver(value.trim() === "" ? null : side);
    if (side === "width") {
      setNewWidth(value);
      setNewHeight("");
    } else {
      setNewHeight(value);
      setNewWidth("");
    }
  };

  const applyPreset = (index: string) => {
    const preset = PRESETS[Number(index)];
    if (!preset) return;
    editOriginal("width", String(preset[0]));
    editOriginal("height", String(preset[1]));
  };

  const swap = () => {
    setWidth(height);
    setHeight(width);
    setNewWidth(newHeight);
    setNewHeight(newWidth);
    setDriver(driver === "width" ? "height" : driver === "height" ? "width" : null);
    setRatio(null);
  };

  const handleCalculate = useCallback(async () => {
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "aspect-ratio-calculator",
      is_batch: false,
      file_count: 0,
    });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);

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
      const res = await fetch(appUrl("/api/v1/tools/image/aspect-ratio-calculator"), {
        method: "POST",
        headers: {
          ...formatHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          width: parsedWidth,
          height: parsedHeight,
          newWidth: driver === "width" ? target : undefined,
          newHeight: driver === "height" ? target : undefined,
          round,
        }),
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

      const data = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (controller.signal.aborted || storeReset) return;
      if (!isAspectRatioResponse(data)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      setRatio(data.ratio);
      if (data.newWidth !== null) setNewWidth(String(data.newWidth));
      if (data.newHeight !== null) setNewHeight(String(data.newHeight));
    } catch (err) {
      if (
        controller.signal.aborted ||
        storeReset ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      unsubscribe();
      setError(userErrorMessage(t, err, ts.calculateFailed));
    } finally {
      unsubscribe();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted && !storeReset) {
        setProcessing(false);
      }
    }
  }, [parsedWidth, parsedHeight, driver, target, round, setProcessing, setError, t, ts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canCalculate) handleCalculate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Locked while a request runs, so a late answer can't land in fields that changed under it. */}
      <fieldset disabled={processing} className="space-y-4">
        <div>
          <label htmlFor="aspect-ratio-preset" className="text-xs text-muted-foreground">
            {ts.preset}
          </label>
          <select
            id="aspect-ratio-preset"
            value=""
            onChange={(e) => applyPreset(e.target.value)}
            className={INPUT_CLASS}
            data-testid="aspect-ratio-preset"
          >
            <option value="">{ts.custom}</option>
            {PRESETS.map(([w, h], i) => (
              <option key={`${w}:${h}`} value={i}>
                {w}:{h}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="aspect-ratio-width" className="text-xs text-muted-foreground">
              {ts.originalWidth}
            </label>
            <input
              id="aspect-ratio-width"
              type="number"
              min={0}
              step="any"
              value={width}
              onChange={(e) => editOriginal("width", e.target.value)}
              className={INPUT_CLASS}
              data-testid="aspect-ratio-width"
            />
          </div>
          <div>
            <label htmlFor="aspect-ratio-height" className="text-xs text-muted-foreground">
              {ts.originalHeight}
            </label>
            <input
              id="aspect-ratio-height"
              type="number"
              min={0}
              step="any"
              value={height}
              onChange={(e) => editOriginal("height", e.target.value)}
              className={INPUT_CLASS}
              data-testid="aspect-ratio-height"
            />
          </div>
          <div>
            <label htmlFor="aspect-ratio-new-width" className="text-xs text-muted-foreground">
              {ts.newWidth}
            </label>
            <input
              id="aspect-ratio-new-width"
              type="number"
              min={0}
              step="any"
              value={newWidth}
              onChange={(e) => editTarget("width", e.target.value)}
              className={INPUT_CLASS}
              data-testid="aspect-ratio-new-width"
            />
          </div>
          <div>
            <label htmlFor="aspect-ratio-new-height" className="text-xs text-muted-foreground">
              {ts.newHeight}
            </label>
            <input
              id="aspect-ratio-new-height"
              type="number"
              min={0}
              step="any"
              value={newHeight}
              onChange={(e) => editTarget("height", e.target.value)}
              className={INPUT_CLASS}
              data-testid="aspect-ratio-new-height"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{ts.hint}</p>

        <button
          type="button"
          onClick={swap}
          data-testid="aspect-ratio-swap"
          className="w-full py-1.5 rounded border border-border text-xs text-foreground flex items-center justify-center gap-2 hover:bg-muted"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {ts.swap}
        </button>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={round}
            onChange={(e) => setRound(e.target.checked)}
            className="rounded border-border"
          />
          {ts.round}
        </label>
      </fieldset>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {ratio && (
        <div
          className="rounded border border-border p-3 text-center"
          data-testid="aspect-ratio-result"
        >
          <p className="text-xs text-muted-foreground">{ts.ratio}</p>
          <p className="text-2xl font-mono text-foreground">{ratio}</p>
        </div>
      )}

      <button
        type="submit"
        data-testid="aspect-ratio-calculator-submit"
        disabled={!canCalculate}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {ts.submit}
      </button>
    </form>
  );
}
