import type { TranslationKeys } from "@snapotter/shared";
import { Check, Copy, Download, Search, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { format, plural } from "@/lib/format";
import {
  jobFailureMessage,
  MalformedResultError,
  reportMalformedResult,
} from "@/lib/progress-frames";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { useRunProgress } from "@/lib/run-progress";
import { copyToClipboard } from "@/lib/utils";
import { createXhrWatchdog, type XhrWatchdog } from "@/lib/xhr-watchdog";
import { useFileStore } from "@/stores/file-store";

interface BarcodeResult {
  type: string;
  text: string;
  position: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
}

interface FileResult {
  filename: string;
  barcodes: BarcodeResult[];
}

/** Human-readable barcode type labels. */
const FORMAT_LABELS: Record<string, string> = {
  QRCode: "QR Code",
  Code128: "Code 128",
  Code39: "Code 39",
  Code93: "Code 93",
  Codabar: "Codabar",
  DataMatrix: "Data Matrix",
  EAN8: "EAN-8",
  EAN13: "EAN-13",
  ITF: "ITF",
  PDF417: "PDF417",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  Aztec: "Aztec",
  MaxiCode: "MaxiCode",
  MicroQRCode: "Micro QR",
  DataBar: "DataBar",
  DataBarExpanded: "DataBar Exp",
};

/** Badge colors by barcode family. */
function getBadgeColor(type: string): string {
  if (type.includes("QR") || type === "Aztec" || type === "DataMatrix" || type === "MaxiCode")
    return "bg-primary/15 text-primary-ink";
  if (type.includes("EAN") || type.includes("UPC") || type.includes("DataBar"))
    return "bg-green-500/15 text-success-ink";
  if (type === "PDF417") return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

/** A sync 2xx answer from the barcode-read route. */
interface BarcodeReadAnswer {
  filename: string;
  barcodes: BarcodeResult[];
  /** The annotated image, or null when nothing was found. */
  annotatedUrl: string | null;
}

function isBarcode(value: unknown): value is BarcodeResult {
  if (value === null || typeof value !== "object") return false;
  const { type, text } = value as { type?: unknown; text?: unknown };
  return typeof type === "string" && typeof text === "string";
}

/**
 * Parses a sync 2xx barcode-read answer. The route answers with decoded
 * barcodes and no downloadUrl, so parseResultBody would turn every good answer
 * away; this checks the fields the panel reads instead and throws a
 * MalformedResultError otherwise (#1795). Nothing of the body goes into the
 * error: a JSON SyntaxError quotes it.
 */
function parseBarcodeAnswer(text: string): BarcodeReadAnswer {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MalformedResultError("notAnObject");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new MalformedResultError("notAnObject");
  }
  const { filename, barcodes, annotatedUrl } = body as Record<string, unknown>;
  if (
    typeof filename !== "string" ||
    !Array.isArray(barcodes) ||
    !barcodes.every(isBarcode) ||
    !(annotatedUrl === null || (typeof annotatedUrl === "string" && annotatedUrl))
  ) {
    throw new MalformedResultError("notABarcodeResult");
  }
  return resolveServerUrls(body as BarcodeReadAnswer);
}

/**
 * Send one file to the barcode-read API and hand a good answer to `land`. Only
 * an answer that isn't one is the server's fault, and it gets reported
 * (#1740). A throw from `land` is our own store write failing: it fails the
 * file with the tracking message and is rethrown so it still surfaces (#1795,
 * after #1354). `onStoppable` gets a stop that drops the request where it
 * stands.
 */
let activeBarcodeWatchdog: XhrWatchdog | null = null;
let barcodePanelPaused = false;

function scanOneFile(
  file: File,
  tryHarder: boolean,
  onUploadProgress: (pct: number) => void,
  land: (answer: BarcodeReadAnswer) => void,
  onStoppable: (stop: () => void) => void,
  t: TranslationKeys,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify({ tryHarder }));

    const xhr = new XMLHttpRequest();

    // Set once the scan stops: an answer arriving after that, from a request
    // the abort didn't reach, must not land on entries that aren't ours.
    let stopped = false;
    const watchdog = createXhrWatchdog(xhr, 300_000, () => !stopped);
    if (barcodePanelPaused) {
      watchdog.pause();
    }
    activeBarcodeWatchdog = watchdog;
    const clearWatchdog = () => {
      watchdog.clear();
      if (activeBarcodeWatchdog === watchdog) {
        activeBarcodeWatchdog = null;
      }
    };

    xhr.upload.onprogress = (e) => {
      if (stopped) return;
      watchdog.onUploadProgress(e);
      if (e.lengthComputable) onUploadProgress((e.loaded / e.total) * 100);
    };

    xhr.upload.onload = () => {
      if (stopped) return;
      watchdog.onUploadLoad();
    };

    xhr.onload = () => {
      clearWatchdog();
      if (stopped) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        let answer: BarcodeReadAnswer;
        try {
          answer = parseBarcodeAnswer(xhr.responseText);
        } catch (err) {
          reject(new Error(t.errors.invalidResponse));
          reportMalformedResult(err, { status: xhr.status, toolId: "barcode-read" });
          return;
        }
        try {
          land(answer);
        } catch (err) {
          reject(new Error(jobFailureMessage({ reason: "trackingFailed" }, t.errors)));
          throw err;
        }
        resolve();
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(
            new Error(
              failedAnswerMessage(
                t,
                body,
                xhr.status,
                format(t.errors.failedWithStatus, { status: xhr.status }),
              ),
            ),
          );
        } catch {
          reject(
            new Error(
              failedAnswerMessage(
                t,
                null,
                xhr.status,
                format(t.toolSettings["barcode-read"].scanningFailedWithStatus, {
                  status: xhr.status,
                }),
              ),
            ),
          );
        }
      }
    };
    xhr.onerror = () => {
      clearWatchdog();
      reject(new Error(t.errors.network));
    };
    xhr.ontimeout = () => {
      clearWatchdog();
      reject(new Error(t.errors.requestTimedOut));
    };
    // The error only settles the promise and never reaches the UI: the scan
    // has already decided to write nothing more for this file.
    onStoppable(() => {
      stopped = true;
      clearWatchdog();
      reject(new Error("Barcode scan stopped"));
      xhr.abort();
    });

    try {
      xhr.open("POST", appUrl("/api/v1/tools/image/barcode-read"));
      for (const [key, value] of formatHeaders()) {
        xhr.setRequestHeader(key, value);
      }
      watchdog.send(formData);
    } catch (err) {
      clearWatchdog();
      throw err;
    }
  });
}

const EMPTY_BARCODE_RESULTS: FileResult[] = [];
let currentBarcodeResults: FileResult[] = EMPTY_BARCODE_RESULTS;
const barcodeCopiedRows = new Set<number>();
let barcodeRunFiles: ReadonlySet<File> | null = null;
let barcodeRunEntryIds: ReadonlySet<string> | null = null;
const barcodeResultListeners = new Set<() => void>();

function notifyBarcodeResults() {
  for (const listener of barcodeResultListeners) {
    listener();
  }
}

function subscribeBarcodeResults(listener: () => void) {
  barcodeResultListeners.add(listener);
  return () => {
    barcodeResultListeners.delete(listener);
  };
}

function getBarcodeResultsSnapshot(): FileResult[] {
  return currentBarcodeResults;
}

function setBarcodeResults(next: FileResult[]) {
  if (next.length === 0) {
    if (currentBarcodeResults === EMPTY_BARCODE_RESULTS) return;
    currentBarcodeResults = EMPTY_BARCODE_RESULTS;
  } else {
    currentBarcodeResults = next;
  }
  notifyBarcodeResults();
}

export function resetBarcodeResults() {
  barcodePanelPaused = false;
  activeBarcodeWatchdog?.clear();
  activeBarcodeWatchdog = null;
  barcodeRunFiles = null;
  barcodeRunEntryIds = null;
  barcodeCopiedRows.clear();
  if (currentBarcodeResults === EMPTY_BARCODE_RESULTS) return;
  currentBarcodeResults = EMPTY_BARCODE_RESULTS;
  notifyBarcodeResults();
}

useFileStore.subscribe((state, prev) => {
  if (
    state.stopCount !== prev.stopCount ||
    state.files.length === 0 ||
    (barcodeRunFiles && !state.files.some((f) => barcodeRunFiles?.has(f))) ||
    (barcodeRunEntryIds &&
      barcodeRunEntryIds.size > 0 &&
      !state.entries.some((e) => barcodeRunEntryIds?.has(e.id))) ||
    (!state.processing &&
      prev.entries.some((e) => e.processedUrl !== null || e.status === "completed") &&
      state.entries.every((e) => e.processedUrl === null && e.status === "pending"))
  ) {
    resetBarcodeResults();
  }
});

export function BarcodeReadSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [tryHarder, setTryHarder] = useState(false);
  // Shared across a bare panel unmount so closing the mobile settings sheet or
  // crossing the 768px breakpoint keeps the decoded barcode table visible (#2889).
  const results = useSyncExternalStore(
    subscribeBarcodeResults,
    getBarcodeResultsSnapshot,
    getBarcodeResultsSnapshot,
  );
  const [rowCopy, setRowCopy] = useState<{ idx: number; ok: boolean } | null>(null);
  const [allCopy, setAllCopy] = useState<"copied" | "failed" | null>(null);
  const later = useTimeouts();

  useEffect(() => {
    barcodePanelPaused = false;
    activeBarcodeWatchdog?.resume();
    return () => {
      barcodePanelPaused = true;
      activeBarcodeWatchdog?.pause();
    };
  }, []);

  // Unmounting stops the elapsed counter. The scan itself stops only once its
  // files leave the store (see handleProcess), and shared progress state lets a
  // remounted panel show the live phase, percent, stage, and elapsed counter (#2315).
  const {
    progressPhase,
    progressPercent,
    progressStage,
    elapsed,
    startRunProgress,
    clearRunProgressTimer,
    setProgressPhase,
    setProgressPercent,
    setProgressStage,
  } = useRunProgress();

  const handleProcess = async () => {
    if (files.length === 0) return;

    const total = files.length;
    const allResults: FileResult[] = [];
    const errors: string[] = [];
    const { entries: initialEntries, updateEntryById } = useFileStore.getState();
    const entryIds = initialEntries.map((e) => e.id);
    for (const entry of initialEntries) {
      if (entry.processedUrl !== null) {
        updateEntryById(entry.id, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          status: "pending",
          error: null,
        });
      }
    }

    const runFiles = new Set(files);
    const runEntryIds = new Set(entryIds);
    barcodeRunFiles = runFiles;
    barcodeRunEntryIds = runEntryIds;
    barcodeCopiedRows.clear();
    setError(null);
    setBarcodeResults(EMPTY_BARCODE_RESULTS);
    setProcessing(true);
    const runTimer = startRunProgress();

    // Leaving the tool route bumps stopCount (#1994), leaving for another tool
    // resets the file store, and opening library files replaces it. Either way
    // the scan stops there: the request in flight is dropped, no more files are
    // sent, and nothing is written to entries that now belong to someone else
    // (#1932). This keys on the store rather than on unmount because the panel
    // also unmounts when the layout swaps across the breakpoint, and that must
    // not end the scan.
    const startStopCount = useFileStore.getState().stopCount;
    let activeIndex = 0;
    let activeItemIndex: number | null = null;
    let activeEntryAborted = false;
    let filesGone = false;
    let stoppedEarly = false;
    let stopInFlight: (() => void) | null = null;
    const isBatchItemPresent = (index: number, state = useFileStore.getState()): boolean => {
      const file = files[index];
      if (!file) return false;
      const entry = initialEntries[index];
      if (entry) {
        return state.entries.some((e) => e.id === entry.id && e.file === file);
      }
      return state.files.includes(file);
    };
    const hasAnyBatchItem = (state: ReturnType<typeof useFileStore.getState>): boolean => {
      if (state.stopCount !== startStopCount) return false;
      for (let idx = 0; idx < total; idx++) {
        if (isBatchItemPresent(idx, state)) return true;
      }
      return false;
    };
    const hasRemainingWork = (state: ReturnType<typeof useFileStore.getState>): boolean => {
      if (state.stopCount !== startStopCount) return false;
      for (let idx = activeIndex; idx < total; idx++) {
        if (isBatchItemPresent(idx, state)) return true;
      }
      return false;
    };
    let processedCount = 0;
    let resultsCommitted = false;
    const commitCompletedResults = () => {
      if (resultsCommitted || filesGone || processedCount === 0) return;
      resultsCommitted = true;
      if (errors.length === processedCount) {
        setError(errors.join("; "));
      } else if (errors.length > 0) {
        setError(
          format(t.toolSettings["barcode-read"].filesFailed, {
            count: errors.length,
            total: processedCount,
          }),
        );
      }

      setBarcodeResults(allResults);
    };
    const stopScanNow = (commitPartial: boolean) => {
      stoppedEarly = true;
      activeEntryAborted = true;
      activeItemIndex = null;
      const stop = stopInFlight;
      stopInFlight = null;
      // This runs inside whoever replaced the files or left the route: a throw
      // here must not break their update.
      let stopError: { cause: unknown } | null = null;
      for (const step of [
        () => stop?.(),
        ...(commitPartial ? [commitCompletedResults] : []),
        () => {
          if (useFileStore.getState().processing) setProcessing(false);
        },
        () => setProgressPhase("idle"),
      ]) {
        try {
          step();
        } catch (err) {
          stopError ??= { cause: err };
        }
      }
      if (stopError) {
        reportRunEndFailure(
          "Stopping a barcode scan whose files left failed",
          stopError.cause,
          "barcode-read",
        );
      }
    };
    const unsubscribe = useFileStore.subscribe((state) => {
      if (filesGone) return;
      if (!hasAnyBatchItem(state)) {
        filesGone = true;
        if (!stoppedEarly) stopScanNow(false);
        return;
      }
      if (!hasRemainingWork(state)) {
        if (!stoppedEarly) stopScanNow(true);
        return;
      }
      if (activeItemIndex !== null && !isBatchItemPresent(activeItemIndex, state)) {
        activeEntryAborted = true;
        activeItemIndex = null;
        const stop = stopInFlight;
        stopInFlight = null;
        try {
          stop?.();
        } catch (err) {
          reportRunEndFailure(
            "Stopping a barcode scan whose files left failed",
            err,
            "barcode-read",
          );
        }
      }
    });

    try {
      for (let i = 0; i < total; i++) {
        activeIndex = i;
        if (filesGone || stoppedEarly) break;
        if (!isBatchItemPresent(i)) continue;
        const file = files[i];
        const entryId = entryIds[i];
        const prefix = total > 1 ? `[${i + 1}/${total}] ` : "";
        const fileBase = (i / total) * 100;
        const fileShare = 100 / total;

        activeItemIndex = i;
        activeEntryAborted = false;
        try {
          setProgressStage(
            `${prefix}${format(t.toolSettings["barcode-read"].scanningFile, { name: file.name })}`,
          );

          await scanOneFile(
            file,
            tryHarder,
            (pct) => {
              if (filesGone || stoppedEarly || activeEntryAborted) return;
              setProgressPhase("uploading");
              setProgressPercent(fileBase + (pct / 100) * fileShare * 0.5);
            },
            (answer) => {
              if (filesGone || activeEntryAborted || !isBatchItemPresent(i)) return;
              setProgressPhase("processing");
              setProgressPercent(fileBase + fileShare);

              allResults.push({
                filename: answer.filename,
                barcodes: answer.barcodes,
              });

              // Set annotated image as processedUrl for before/after view
              if (answer.annotatedUrl && entryId) {
                updateEntryById(entryId, {
                  processedUrl: answer.annotatedUrl,
                  processedPreviewUrl: answer.annotatedUrl,
                  processedFilename: `annotated-${file.name.replace(/\.[^.]+$/, "")}.png`,
                  status: "completed",
                  processedSize: null,
                });
              }
            },
            (stop) => {
              stopInFlight = stop;
            },
            t,
          );
          if (filesGone) break;
          if (activeEntryAborted || !isBatchItemPresent(i)) continue;
          processedCount++;
        } catch (err) {
          if (filesGone) break;
          if (activeEntryAborted || !isBatchItemPresent(i)) continue;
          const hadLandedResult = allResults.length === processedCount + 1;
          processedCount++;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${file.name}: ${msg}`);
          // A throw while landing comes after this file's barcodes went in.
          if (!hadLandedResult) allResults.push({ filename: file.name, barcodes: [] });
        } finally {
          activeItemIndex = null;
          stopInFlight = null;
        }
      }
    } finally {
      unsubscribe();
      clearRunProgressTimer(runTimer);
      if (!filesGone && !stoppedEarly) setProgressPhase("idle");
    }

    // The results and errors belong to a scan that was stopped. Its store watch
    // already cleared processing when the stop fired, so don't write it again
    // after the await where a next run may have started (#1994).
    if (filesGone || stoppedEarly || processedCount === 0) {
      if (!filesGone && !stoppedEarly) {
        setProcessing(false);
      }
      return;
    }

    try {
      commitCompletedResults();
    } finally {
      setProcessing(false);
    }
  };

  // Total barcode count across all files
  const totalBarcodes = results.reduce((sum, r) => sum + r.barcodes.length, 0);

  const captureEntryUrls = (): Array<{ id: string; url: string }> =>
    useFileStore
      .getState()
      .entries.flatMap((e) => (e.processedUrl ? [{ id: e.id, url: e.processedUrl }] : []));

  const claimCapturedEntries = (targets: ReadonlyArray<{ id: string; url: string }>) => {
    const store = useFileStore.getState();
    for (const { id, url } of targets) {
      store.markClaimedById(id, url);
    }
  };

  const handleCopyOne = async (text: string, globalIdx: number) => {
    const targets = captureEntryUrls();
    const ok = await copyToClipboard(text);
    if (ok) {
      barcodeCopiedRows.add(globalIdx);
      if (totalBarcodes > 0 && barcodeCopiedRows.size >= totalBarcodes) {
        claimCapturedEntries(targets);
      }
    }
    setRowCopy({ idx: globalIdx, ok });
    later(() => setRowCopy(null), 1500, "rowCopy");
  };

  const handleCopyAll = async () => {
    const targets = captureEntryUrls();
    const allText = results
      .flatMap((r) => r.barcodes.map((b) => `${FORMAT_LABELS[b.type] ?? b.type}: ${b.text}`))
      .join("\n");
    const ok = await copyToClipboard(allText);
    if (ok) {
      claimCapturedEntries(targets);
    }
    setAllCopy(ok ? "copied" : "failed");
    later(() => setAllCopy(null), 2000, "allCopy");
  };

  const handleExportCsv = () => {
    const targets = captureEntryUrls();
    const header = "File,Type,Value\n";
    const rows = results
      .flatMap((r) =>
        r.barcodes.map(
          (b) =>
            `"${r.filename.replace(/"/g, '""')}","${FORMAT_LABELS[b.type] ?? b.type}","${b.text.replace(/"/g, '""')}"`,
        ),
      )
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "barcode-results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    claimCapturedEntries(targets);
  };

  const hasFile = files.length > 0;
  let globalIndex = 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t.toolSettings["barcode-read"].scanImagesForQrCodes}
      </p>

      {/* Thorough scan toggle */}
      <SectionLabel>{t.toolSettings["barcode-read"].options}</SectionLabel>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={tryHarder}
          onChange={(e) => setTryHarder(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">
          {t.toolSettings["barcode-read"].thoroughScan}
        </span>
        <span
          title={t.toolSettings["barcode-read"].spendsMoreTimeAnalyzingThe}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground text-[10px] cursor-help"
        >
          ?
        </span>
      </label>

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label={t.toolSettings["barcode-read"].scanningForBarcodes}
          stage={progressStage}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="barcode-read-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Search className="h-4 w-4" />
          {files.length > 1
            ? format(t.toolSettings["barcode-read"].scanBarcodesBatch, { count: files.length })
            : t.toolSettings["barcode-read"].submit}
        </button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {/* Summary badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {totalBarcodes === 0
                ? t.toolSettings["barcode-read"].noBarcodesFound
                : plural(
                    totalBarcodes,
                    format(t.toolSettings["barcode-read"].foundBarcode, { count: totalBarcodes }),
                    format(t.toolSettings["barcode-read"].foundBarcodePlural, {
                      count: totalBarcodes,
                    }),
                  )}
            </span>
            {totalBarcodes > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {allCopy === "copied" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {allCopy === "copied"
                    ? t.toolSettings["barcode-read"].copied
                    : allCopy === "failed"
                      ? t.common.copyFailed
                      : t.toolSettings["barcode-read"].copyAll}
                </button>
              </div>
            )}
          </div>

          {/* Per-file results */}
          {results.map((fileResult) => (
            <div key={fileResult.filename} className="space-y-1.5">
              {/* Show filename header only when multiple files */}
              {results.length > 1 && (
                <p className="text-[11px] font-medium text-muted-foreground truncate pt-1">
                  {fileResult.filename}
                </p>
              )}

              {fileResult.barcodes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">
                  {t.toolSettings["barcode-read"].noBarcodesFound}
                </p>
              ) : (
                fileResult.barcodes.map((barcode) => {
                  const idx = globalIndex++;
                  const label = FORMAT_LABELS[barcode.type] ?? barcode.type;
                  const badgeColor = getBadgeColor(barcode.type);
                  return (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-muted group">
                      {/* Barcode type badge */}
                      <div className="shrink-0 pt-0.5">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeColor}`}
                        >
                          {label}
                        </span>
                      </div>
                      {/* Decoded value */}
                      <p className="flex-1 text-sm text-foreground font-mono break-all leading-relaxed">
                        {barcode.text}
                      </p>
                      {/* Copy button */}
                      <button
                        type="button"
                        onClick={() => handleCopyOne(barcode.text, idx)}
                        className="shrink-0 p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                        title={
                          rowCopy?.idx === idx && !rowCopy.ok
                            ? t.common.copyFailed
                            : t.toolSettings["barcode-read"].copyValue
                        }
                      >
                        {rowCopy?.idx !== idx ? (
                          <Copy className="h-3.5 w-3.5" />
                        ) : rowCopy.ok ? (
                          <Check className="h-3.5 w-3.5 text-success-ink" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
