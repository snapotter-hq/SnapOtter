import {
  ANALYTICS_EVENTS,
  en,
  type LibrarySaveMode,
  type TranslationKeys,
} from "@snapotter/shared";
import { Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, Info } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { CopyFeedback } from "@/components/common/copy-feedback";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { trackAbandonedJob } from "@/lib/cancel-abandoned-job";
import { format } from "@/lib/format";
import { failedFrameMessage, type ProgressFrame } from "@/lib/progress-frames";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { useRunProgress } from "@/lib/run-progress";
import { copyToClipboard, generateId } from "@/lib/utils";
import { createXhrWatchdog, type XhrWatchdog } from "@/lib/xhr-watchdog";
import { useFileStore } from "@/stores/file-store";
import { type OcrQuality, OcrQualityControl, useOcrQuality } from "./ocr-quality-control";

const LANGUAGE_CODES = ["auto", "en", "de", "fr", "es", "zh", "ja", "ko", "ar"] as const;

const ENHANCE_DEFAULTS: Record<OcrQuality, boolean> = {
  fast: false,
  balanced: false,
  // Best evaluates the conservative contrast variant and keeps it only when
  // the calibrated selector scores it above the original.
  best: true,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

const OCR_ASYNC_STALL_TIMEOUT_MS = 5 * 60_000;
let activeOcrWatchdog: XhrWatchdog | null = null;
let ocrPanelPaused = false;

/** Send one file to the OCR API and return the extracted text. */
export function ocrOneFile(
  file: File,
  settings: { quality: string; language: string; enhance: boolean },
  callbacks: {
    onUploadProgress: (pct: number) => void;
    onProcessingProgress: (pct: number, stage: string) => void;
    /** Gets a stop that drops the file where it stands: request, stream and stall timer. */
    onStoppable?: (stop: () => void) => void;
  },
  messages: {
    timeout?: string;
    networkError?: string;
    processingFailed?: string;
    /** The UI locale, for the install message of a FEATURE_NOT_INSTALLED answer. */
    t?: TranslationKeys;
  } = {},
  // When the file came from the library, forward the save choice so the
  // extracted-text artifact auto-saves (#565). Only sent for single-file runs.
  library?: { fileId: string; saveMode: LibrarySaveMode },
): Promise<{ text: string; savedFileId?: string }> {
  return new Promise((resolve, reject) => {
    const clientJobId = generateId();
    let settled = false;
    let asyncMode = false;
    const abandonedJob = trackAbandonedJob(clientJobId, "ocr");
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let watchdog: XhrWatchdog | null = null;

    const clearWatchdog = () => {
      watchdog?.clear();
      if (activeOcrWatchdog === watchdog) {
        activeOcrWatchdog = null;
      }
    };

    const cleanup = () => {
      clearWatchdog();
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      es?.close();
      es = null;
    };

    const resolveOnce = (result: { text: string; savedFileId?: string }) => {
      if (settled) return;
      settled = true;
      try {
        cleanup();
      } finally {
        resolve(result);
      }
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      // A throw while closing the stream must still settle the file, or a
      // stopped scan would wait on it forever.
      try {
        cleanup();
      } finally {
        reject(error);
      }
    };

    const armStallTimer = () => {
      if (settled) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (settled) return;
        abandonedJob.cancelOnStall();
        try {
          rejectOnce(
            new Error(
              messages.timeout ??
                "OCR timed out with no progress. Try again or use a smaller image.",
            ),
          );
        } finally {
          xhr.abort();
        }
      }, OCR_ASYNC_STALL_TIMEOUT_MS);
    };

    try {
      es = new EventSource(appUrl(`/api/v1/jobs/${clientJobId}/progress`));
    } catch {
      rejectOnce(new Error(messages.networkError ?? "Unable to subscribe to OCR progress"));
      return;
    }
    es.onmessage = (event) => {
      if (settled) return;
      // Only an unparseable frame is ignorable. A throw past the parse is our
      // own handling failing, and it must end the run (#1287).
      let data: ProgressFrame;
      try {
        data = resolveServerUrls(JSON.parse(event.data));
      } catch {
        return;
      }
      try {
        if (data.type === "heartbeat") {
          if (asyncMode) armStallTimer();
          return;
        }
        if (data.type !== "single") return;
        watchdog?.onUploadLoad();
        armStallTimer();
        if (data.phase === "complete" && data.result) {
          resolveOnce({
            text: typeof data.result.text === "string" ? data.result.text : "",
            savedFileId:
              typeof data.result.savedFileId === "string" ? data.result.savedFileId : undefined,
          });
          return;
        }
        if (data.phase === "failed") {
          rejectOnce(
            new Error(
              failedFrameMessage(
                data,
                messages.processingFailed ?? (messages.t ?? en).errors.processingFailedNoDetail,
                (messages.t ?? en).errors.canceled,
              ),
            ),
          );
          return;
        }
        abandonedJob.onAccepted();
        if (typeof data.percent === "number") {
          callbacks.onProcessingProgress(data.percent, data.stage ?? "");
        }
      } catch (err) {
        if (!settled) {
          abandonedJob.cancelOnStall();
          try {
            rejectOnce(
              new Error(
                messages.t
                  ? messages.t.errors.jobTrackingFailed
                  : (messages.processingFailed ?? en.errors.jobTrackingFailed),
              ),
            );
          } finally {
            xhr.abort();
          }
        }
        throw err;
      }
    };
    // EventSource reconnects automatically. The progress endpoint replays the
    // terminal frame, so transient network loss must not discard a queued OCR.
    es.onerror = () => {};

    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify(settings));
    formData.append("clientJobId", clientJobId);
    if (library) {
      formData.append("fileId", library.fileId);
      formData.append("saveMode", library.saveMode);
    }

    const xhr = new XMLHttpRequest();
    watchdog = createXhrWatchdog(xhr, 600_000, () => !settled && !asyncMode);
    if (ocrPanelPaused) {
      watchdog.pause();
    }
    activeOcrWatchdog = watchdog;
    xhr.upload.onprogress = (e) => {
      watchdog?.onUploadProgress(e);
      if (!e.lengthComputable) return;
      abandonedJob.onUploadProgress(e);
      if (settled) return;
      callbacks.onUploadProgress((e.loaded / e.total) * 100);
    };
    xhr.upload.onload = () => {
      abandonedJob.onUploadLoad();
      watchdog?.onUploadLoad();
    };
    xhr.onload = () => {
      clearWatchdog();
      // The BullMQ worker owns long OCR jobs. Keep the progress subscription
      // alive and resolve from buildLegacyResultPayload(resultPayload).text.
      if (xhr.status === 202) {
        asyncMode = true;
        abandonedJob.onAccepted();
        if (settled) return;
        armStallTimer();
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          resolveOnce({
            text: typeof body.text === "string" ? body.text : "",
            savedFileId: typeof body.savedFileId === "string" ? body.savedFileId : undefined,
          });
        } catch {
          rejectOnce(new Error(messages.processingFailed ?? "Invalid response"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          rejectOnce(
            new Error(
              failedAnswerMessage(messages.t ?? en, body, xhr.status, `Failed: ${xhr.status}`),
            ),
          );
        } catch {
          rejectOnce(
            new Error(
              failedAnswerMessage(
                messages.t ?? en,
                null,
                xhr.status,
                messages.processingFailed ?? `Processing failed: ${xhr.status}`,
              ),
            ),
          );
        }
      }
    };
    xhr.onerror = () => rejectOnce(new Error(messages.networkError ?? "Network error"));
    xhr.ontimeout = () => rejectOnce(new Error(messages.timeout ?? "OCR request timed out"));
    xhr.onabort = () => rejectOnce(new Error(messages.processingFailed ?? "OCR request canceled"));
    // Settling first closes the stream and the stall timer, and covers a file
    // the server already took async, whose XHR is done and won't abort. The
    // error never reaches the UI: the scan writes nothing more for this file.
    callbacks.onStoppable?.(() => {
      // Only an unsettled file has a job or upload in flight (#2093, #2136).
      // Evaluated first, so a teardown step that throws can't leave the job running.
      const keepRequest = !settled && abandonedJob.keepRequestOnStop();
      rejectOnce(new Error("OCR scan stopped"));
      if (!keepRequest) xhr.abort();
    });
    try {
      xhr.open("POST", appUrl("/api/v1/tools/image/ocr"));
      for (const [key, value] of formatHeaders()) {
        xhr.setRequestHeader(key, value);
      }
      watchdog.send(formData);
    } catch (err) {
      rejectOnce(err instanceof Error ? err : new Error(messages.networkError ?? "Network error"));
    }
  });
}

interface OcrResultSnapshot {
  text: string | null;
  savedLibraryFileId: string | null;
  resultEntryId: string | null;
}

const IDLE_OCR_RESULT: OcrResultSnapshot = {
  text: null,
  savedLibraryFileId: null,
  resultEntryId: null,
};

let currentOcrResult: OcrResultSnapshot = IDLE_OCR_RESULT;
let ocrRunFiles: ReadonlySet<File> | null = null;
let ocrRunEntryIds: ReadonlySet<string> | null = null;
const ocrResultListeners = new Set<() => void>();

function notifyOcrResult() {
  for (const listener of ocrResultListeners) {
    listener();
  }
}

function subscribeOcrResult(listener: () => void) {
  ocrResultListeners.add(listener);
  return () => {
    ocrResultListeners.delete(listener);
  };
}

function getOcrResultSnapshot(): OcrResultSnapshot {
  return currentOcrResult;
}

function updateOcrResult(patch: Partial<OcrResultSnapshot>) {
  currentOcrResult = { ...currentOcrResult, ...patch };
  notifyOcrResult();
}

export function resetOcrResult() {
  ocrPanelPaused = false;
  activeOcrWatchdog?.clear();
  activeOcrWatchdog = null;
  ocrRunFiles = null;
  ocrRunEntryIds = null;
  if (currentOcrResult === IDLE_OCR_RESULT) return;
  currentOcrResult = IDLE_OCR_RESULT;
  notifyOcrResult();
}

useFileStore.subscribe((state, prev) => {
  if (
    state.stopCount !== prev.stopCount ||
    state.files.length === 0 ||
    (ocrRunFiles && !state.files.some((f) => ocrRunFiles?.has(f))) ||
    (ocrRunEntryIds &&
      ocrRunEntryIds.size > 0 &&
      !state.entries.some((e) => ocrRunEntryIds?.has(e.id)))
  ) {
    resetOcrResult();
  }
});

function resolveOcrEntryId(
  store: ReturnType<typeof useFileStore.getState>,
  resultEntryId: string | null,
): string | null {
  if (resultEntryId !== null && store.entries.some((e) => e.id === resultEntryId)) {
    return resultEntryId;
  }
  return store.entries.find((e) => e.processedUrl)?.id ?? store.entries[0]?.id ?? null;
}

export function OcrSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [language, setLanguage] = useState("auto");
  const { quality, setQuality, canRun } = useOcrQuality(language);
  const [enhance, setEnhance] = useState(false);
  const [enhanceManuallySet, setEnhanceManuallySet] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Shared across a bare panel unmount so closing the mobile settings sheet or
  // crossing the 768px breakpoint keeps the extracted text and library save
  // confirmation visible (#2889).
  const { text, savedLibraryFileId, resultEntryId } = useSyncExternalStore(
    subscribeOcrResult,
    getOcrResultSnapshot,
    getOcrResultSnapshot,
  );
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const later = useTimeouts();

  useEffect(() => {
    ocrPanelPaused = false;
    activeOcrWatchdog?.resume();
    return () => {
      ocrPanelPaused = true;
      activeOcrWatchdog?.pause();
    };
  }, []);

  const ocrFilenameFor = (currentFiles: File[]) => {
    const baseName =
      currentFiles.length === 1
        ? (currentFiles[0]?.name?.replace(/\.[^.]+$/, "") ?? "extracted")
        : "ocr_results";
    return `${baseName}_ocr.txt`;
  };

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

  useEffect(() => {
    if (!enhanceManuallySet) setEnhance(ENHANCE_DEFAULTS[quality]);
  }, [enhanceManuallySet, quality]);

  const handleQualityChange = (q: OcrQuality) => {
    setQuality(q);
    if (!enhanceManuallySet) setEnhance(ENHANCE_DEFAULTS[q]);
  };

  const handleEnhanceToggle = (checked: boolean) => {
    setEnhance(checked);
    setEnhanceManuallySet(true);
  };

  const handleProcess = async () => {
    if (files.length === 0) return;

    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "ocr",
      is_batch: files.length > 1,
      file_count: files.length,
    });

    const {
      entries: startEntries,
      selectedIndex: capturedIndex,
      librarySaveMode: capturedSaveMode,
    } = useFileStore.getState();
    const capturedEntryId = startEntries[capturedIndex]?.id ?? startEntries[0]?.id ?? null;
    for (const entry of startEntries) {
      if (entry.processedUrl) {
        if (entry.processedUrl.startsWith("blob:")) URL.revokeObjectURL(entry.processedUrl);
        useFileStore.getState().updateEntryById(entry.id, {
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          status: "pending",
          error: null,
        });
      }
    }

    const runFiles = new Set(files);
    const runEntryIds = new Set(startEntries.map((e) => e.id));
    ocrRunFiles = runFiles;
    ocrRunEntryIds = runEntryIds;
    setError(null);
    updateOcrResult({
      text: null,
      savedLibraryFileId: null,
      resultEntryId: capturedEntryId,
    });
    setProcessing(true);
    const runTimer = startRunProgress();

    const settings = { quality, language, enhance };
    const total = files.length;
    const results: string[] = [];
    const errors: string[] = [];
    let autoSavedFileId: string | undefined;

    // Leaving the tool route bumps stopCount (#1994), leaving for another tool
    // resets the file store, and opening library files replaces it. Either way
    // the scan stops there: the file in flight is dropped (request, progress
    // stream and stall timer) and no more files are sent (#1932). This keys on
    // the store rather than on unmount because the panel also unmounts when the
    // layout swaps across the breakpoint, and that must not end the scan.
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
      const entry = startEntries[index];
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
      const joined = results.join("\n\n");
      if (errors.length === processedCount) {
        setError(errors.join("; "));
      } else if (errors.length > 0) {
        setError(
          format(t.toolSettings.ocr.filesFailed, { failed: errors.length, total: processedCount }),
        );
      }

      const store = useFileStore.getState();
      const targetEntryId = resolveOcrEntryId(store, capturedEntryId);
      if (errors.length < processedCount && targetEntryId && joined.length > 0) {
        const prevUrl = store.entries.find((e) => e.id === targetEntryId)?.processedUrl;
        if (prevUrl?.startsWith("blob:")) URL.revokeObjectURL(prevUrl);
        const blob = new Blob([joined], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        store.updateEntryById(targetEntryId, {
          processedUrl: url,
          processedFilename: ocrFilenameFor(files),
          status: "completed",
          ...(autoSavedFileId && capturedSaveMode === "overwrite"
            ? { serverFileId: autoSavedFileId }
            : {}),
        });
        if (autoSavedFileId) {
          store.markClaimedById(targetEntryId);
        }
      }
      updateOcrResult({
        text: joined,
        savedLibraryFileId: autoSavedFileId ?? null,
        resultEntryId: targetEntryId,
      });
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
        reportRunEndFailure("Stopping an OCR scan whose files left failed", stopError.cause, "ocr");
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
          reportRunEndFailure("Stopping an OCR scan whose files left failed", err, "ocr");
        }
      }
    });

    try {
      for (let i = 0; i < total; i++) {
        activeIndex = i;
        if (filesGone || stoppedEarly) break;
        if (!isBatchItemPresent(i)) continue;
        const file = files[i];
        const prefix = total > 1 ? `[${i + 1}/${total}] ` : "";
        // Each file gets an equal share of the 0-100 progress bar
        const fileBase = (i / total) * 100;
        const fileShare = 100 / total;

        // Only a single-file run auto-saves to the library; a multi-file batch
        // never sends a fileId (matching the standard batch processor).
        const serverFileId =
          total === 1 ? useFileStore.getState().entries[i]?.serverFileId : undefined;
        const library = serverFileId
          ? { fileId: serverFileId, saveMode: capturedSaveMode }
          : undefined;

        activeItemIndex = i;
        activeEntryAborted = false;
        try {
          const { text, savedFileId } = await ocrOneFile(
            file,
            settings,
            {
              onUploadProgress: (pct) => {
                if (filesGone || stoppedEarly || activeEntryAborted) return;
                setProgressPhase("uploading");
                setProgressPercent(fileBase + (pct / 100) * fileShare * 0.15);
                setProgressStage(`${prefix}Uploading...`);
              },
              onProcessingProgress: (pct, stage) => {
                if (filesGone || stoppedEarly || activeEntryAborted) return;
                setProgressPhase("processing");
                setProgressPercent(fileBase + fileShare * 0.15 + (pct / 100) * fileShare * 0.85);
                setProgressStage(`${prefix}${stage}`);
              },
              onStoppable: (stop) => {
                stopInFlight = stop;
              },
            },
            {
              timeout: t.errors.timeout,
              networkError: t.errors.networkError,
              processingFailed: t.errors.processingFailed,
              t,
            },
            library,
          );
          if (filesGone) break;
          if (activeEntryAborted || !isBatchItemPresent(i)) continue;
          processedCount++;
          // Only single-file runs send a fileId, so savedFileId is single-file only.
          if (savedFileId) {
            autoSavedFileId = savedFileId;
            useFileStore.getState().setLastSavedLibraryFileId(savedFileId);
          }
          results.push(
            total > 1
              ? `--- ${file.name} ---\n${text || t.toolSettings.ocr.noTextDetectedInline}`
              : text,
          );
        } catch (err) {
          if (filesGone) break;
          if (activeEntryAborted || !isBatchItemPresent(i)) continue;
          processedCount++;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${file.name}: ${msg}`);
          results.push(
            total > 1
              ? `--- ${file.name} ---\n${format(t.toolSettings.ocr.fileErrorInline, { message: msg })}`
              : "",
          );
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

    // The text and errors belong to a scan that was stopped. Its store watch
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

  const handleTextChange = (nextText: string) => {
    const store = useFileStore.getState();
    const entryId = resolveOcrEntryId(store, resultEntryId);
    updateOcrResult({ text: nextText, resultEntryId: entryId });
    if (!entryId) return;
    const prevUrl = store.entries.find((e) => e.id === entryId)?.processedUrl;
    if (prevUrl?.startsWith("blob:")) URL.revokeObjectURL(prevUrl);
    if (nextText.length > 0) {
      const blob = new Blob([nextText], { type: "text/plain" });
      store.updateEntryById(entryId, {
        processedUrl: URL.createObjectURL(blob),
        processedFilename: ocrFilenameFor(files),
        status: "completed",
      });
    } else {
      store.updateEntryById(entryId, {
        processedUrl: null,
        processedFilename: null,
        status: "pending",
      });
    }
  };

  const handleCopy = async () => {
    if (text !== null) {
      const storeBefore = useFileStore.getState();
      const entryId = resolveOcrEntryId(storeBefore, resultEntryId);
      const expectedUrl = entryId
        ? (storeBefore.entries.find((e) => e.id === entryId)?.processedUrl ?? undefined)
        : undefined;
      const ok = await copyToClipboard(text);
      if (ok && entryId && expectedUrl) {
        useFileStore.getState().markClaimedById(entryId, expectedUrl);
      }
      setCopyStatus(ok ? "copied" : "failed");
      later(() => setCopyStatus(null), 2000, "copyStatus");
    }
  };

  const handleDownload = () => {
    if (text === null) return;
    track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: "ocr" });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ocrFilenameFor(files);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const store = useFileStore.getState();
    const entryId = resolveOcrEntryId(store, resultEntryId);
    if (entryId) {
      store.markClaimedById(entryId);
    } else {
      store.claimSelected();
    }
  };

  const hasFile = files.length > 0;
  const languageLabel = (code: (typeof LANGUAGE_CODES)[number]) =>
    code === "auto" ? t.toolSettings.ocr.autoDetect : t.commonUi.languageNames[code];
  const selectedCode = LANGUAGE_CODES.find((code) => code === language);
  const langLabel = selectedCode ? languageLabel(selectedCode) : t.toolSettings.ocr.autoDetect;

  return (
    <div className="space-y-3">
      {/* Quality selector */}
      <SectionLabel>{t.toolSettings.ocr.quality}</SectionLabel>
      <OcrQualityControl quality={quality} language={language} onChange={handleQualityChange} />

      {/* Enhance toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enhance}
          onChange={(e) => handleEnhanceToggle(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">
          {t.toolSettings.ocr.enhanceBeforeScanning}
        </span>
        <span
          title={t.toolSettings.ocr.enhanceHint}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground text-[10px] cursor-help"
        >
          <Info className="h-2.5 w-2.5" />
        </span>
      </label>

      {/* Language (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground w-full pt-1"
        >
          {langOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {t.toolSettings.ocr.language}
          <span className="ms-auto text-primary-ink text-[10px] normal-case font-normal">
            {langLabel}
          </span>
        </button>
        {langOpen && (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full mt-1.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          >
            {LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label={t.toolSettings.ocr.progressLabel}
          stage={progressStage}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="ocr-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing || !canRun}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1
            ? format(t.toolSettings.ocr.submitBatch, { count: files.length })
            : t.toolSettings.ocr.submit}
        </button>
      )}

      {/* Result */}
      {text !== null && (
        <div className="space-y-2">
          {savedLibraryFileId && (
            <div className="flex items-center gap-1.5 text-xs text-success-ink">
              <CheckCircle2 className="h-3 w-3" />
              {t.toolPage.savedToFiles}
              <Link to="/files" className="underline underline-offset-2 hover:text-foreground">
                {t.toolPage.viewInFiles}
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t.toolSettings.ocr.extractedText}
            </span>
            <div className="flex items-center gap-3">
              {text.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3" />
                  {t.common.download}
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {copyStatus === "copied" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copyStatus === "copied"
                  ? t.toolSettings.ocr.copied
                  : copyStatus === "failed"
                    ? t.common.copyFailed
                    : t.common.copy}
              </button>
              <CopyFeedback status={copyStatus} />
            </div>
          </div>
          {text.length > 0 ? (
            <>
              <textarea
                data-testid="ocr-result-text"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={Math.min(16, Math.max(8, text.split("\n").length + 2))}
                className="w-full px-2 py-1.5 rounded border border-border bg-muted text-xs text-foreground font-mono resize-y"
              />
              <p className="text-[10px] text-muted-foreground">
                {format(t.toolSettings.ocr.characters, { count: text.length })}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic py-4 text-center">
              {t.toolSettings.ocr.noTextDetected}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
