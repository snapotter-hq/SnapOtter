import { type FeedbackErrorCategory, SafeError } from "@snapotter/shared";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { format } from "@/lib/format";
import {
  checkToolResult,
  frameFailure,
  type JobFailure,
  jobFailureMessage,
  type ProgressFrame,
  parseResultBody,
  reportMalformedResult,
} from "@/lib/progress-frames";
import { reportRunEndFailure } from "@/lib/run-end-report";
import {
  addSignature,
  deleteSignature,
  listSignatures,
  type SavedSignature,
} from "@/lib/signature-store";
import { generateId } from "@/lib/utils";
import { safeRandomUUID } from "@/lib/uuid";
import { useFileStore } from "@/stores/file-store";
import type { SignCanvasRef } from "./sign-canvas";
import { SignaturePad } from "./signature-pad";

const SSE_STALL_TIMEOUT_MS = 5 * 60_000;

/** A result checkToolResult passed: it always carries a download URL. */
type SignResult = Record<string, unknown> & { downloadUrl: string };

interface ProgressHandlers {
  onProgress?: (percent: number) => void;
  onComplete: (result: SignResult) => void;
  onFailed: (failure: JobFailure) => void;
  onStall: () => void;
}

/** A live progress subscription. */
export interface ProgressSubscription {
  /** End it: close the stream and drop the stall timer. Safe to call twice. */
  stop: () => void;
  /**
   * Count something outside the stream as a sign of life and restart the stall
   * timer, the way a heartbeat does. The request's upload progress calls it, so
   * a large PDF still uploading while the stream is quiet isn't called stalled
   * (#1968). Does nothing once the subscription has ended.
   */
  touch: () => void;
}

/**
 * Subscribe to async (202) job progress with the same mobile-resilient recovery
 * as the standard tool processor (PRs #203/#204). Reconnects on tab refocus (the
 * progress endpoint replays the terminal frame from Redis and, after that cache
 * expires, from the durable job record, so a job that finished while SSE was dead
 * still resolves) and arms a stall timeout that fails gracefully instead of
 * hanging at the last percent. The caller must `stop()` it on sync completion,
 * error, or unmount, and should `touch()` it while the upload is moving.
 */
export function subscribeSignPdfJobProgress(
  clientJobId: string,
  handlers: ProgressHandlers,
): ProgressSubscription {
  let es: EventSource | null = null;
  let stall: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const onVisible = () => {
    if (done || document.visibilityState !== "visible") return;
    if (es && es.readyState === EventSource.OPEN) return;
    setTimeout(open, 500);
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    if (stall) clearTimeout(stall);
    stall = null;
    if (es) es.close();
    es = null;
    document.removeEventListener("visibilitychange", onVisible);
  };

  const resetStall = () => {
    // A late touch after the run ended must not arm a stall that would end it twice.
    if (done) return;
    if (stall) clearTimeout(stall);
    stall = setTimeout(() => {
      cleanup();
      handlers.onStall();
    }, SSE_STALL_TIMEOUT_MS);
  };

  function open() {
    if (done) return;
    if (es && es.readyState === EventSource.OPEN) return;
    if (es) es.close();
    try {
      es = new EventSource(appUrl(`/api/v1/jobs/${clientJobId}/progress`));
    } catch {
      return;
    }
    es.onmessage = (event) => {
      // Only an unparseable frame is ignorable. A throw past the parse is our
      // own handling failing, and it must end the run (#1287).
      let data: ProgressFrame;
      try {
        data = resolveServerUrls(JSON.parse(event.data));
      } catch {
        return;
      }
      // A completed frame with nothing to download is the server's bug, the
      // twin of a sync 2xx body with no downloadUrl (#1740). It used to fall
      // through to the progress branch and wait out the stall timer (#1885).
      // It ends the run outside the catch below, so a throw while showing the
      // error can't relabel it as ours (#1830).
      let completed: SignResult | null = null;
      if (data.type === "single" && data.phase === "complete") {
        try {
          completed = checkToolResult<SignResult>(data.result);
        } catch (err) {
          cleanup();
          // Reported first: a throw from onFailed's store writes must not lose it.
          reportMalformedResult(err, { toolId: "sign-pdf" });
          handlers.onFailed({ reason: "invalidResponse" });
          return;
        }
      }
      try {
        if (data.type === "heartbeat") {
          resetStall();
          return;
        }
        if (data.type !== "single") return;
        resetStall();
        if (completed) {
          cleanup();
          handlers.onComplete(completed);
          return;
        }
        if (data.phase === "failed") {
          cleanup();
          handlers.onFailed(frameFailure(data.error, data.details));
          return;
        }
        if (typeof data.percent === "number") handlers.onProgress?.(data.percent);
      } catch (err) {
        // cleanup() already ran if onComplete threw, taking the stall timer
        // with it, so nothing else would ever settle the run.
        cleanup();
        try {
          handlers.onFailed({ reason: "trackingFailed" });
        } catch {
          // onFailed may be what threw; the original error is rethrown below.
        }
        throw err;
      }
    };
    // A transient drop triggers the browser's built-in reconnect; on reconnect
    // the backend replays the terminal frame, so a completed job still resolves.
    es.onerror = () => {};
  }

  document.addEventListener("visibilitychange", onVisible);
  open();
  resetStall();
  return { stop: cleanup, touch: resetStall };
}

/**
 * The name the server gave the signed PDF (`<original>_signed.pdf`), which it
 * puts in the download URL's last segment. The navigation guard offers a result
 * under this name; without it the signed file would be offered under the name
 * of the file that went in.
 */
function signedFilenameFrom(downloadUrl: string): string | null {
  const last = downloadUrl.split("/").pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    // A malformed percent sequence is still a usable name.
    return last;
  }
}

export interface SignProps {
  canvasRef: React.RefObject<SignCanvasRef | null>;
  hasSelection: boolean;
  placementCount: number;
}

export function SignPdfSettings({ signProps }: { signProps?: SignProps }) {
  const { t } = useTranslation();
  const sp = t.toolSettings["sign-pdf"];
  const { currentEntry } = useFileStore();
  const [sigs, setSigs] = useState<SavedSignature[]>(() => listSignatures());
  const [padOpen, setPadOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  /** Set while this panel owns the store's processing flag; see endRun. */
  const runOwnedRef = useRef(false);

  // Tear down the whole run if the panel unmounts mid-job, not just its SSE.
  //
  // The request has to be aborted, the way use-tool-processor aborts its own:
  // a stale onload still runs, still calls endRun, and endRun writes the file
  // store's processing flag, which by then belongs to whatever the next page
  // started. The guard would go quiet during someone else's run.
  //
  // Aborting is not enough on its own. A 202 has already been answered, so
  // there is no request left to abort, and the SSE that would have ended the
  // run goes with this panel: the flag would stay on with nothing left to clear
  // it, and the guard would warn forever about a sign that is over (#1122).
  useEffect(
    () => () => {
      progressCleanupRef.current?.();
      xhrRef.current?.abort();
      if (runOwnedRef.current) {
        runOwnedRef.current = false;
        useFileStore.getState().setProcessing(false);
      }
    },
    [],
  );

  const refresh = () => setSigs(listSignatures());

  const handleSavePad = (dataUrl: string, remember: boolean) => {
    const sig: SavedSignature = remember
      ? addSignature(dataUrl)
      : { id: safeRandomUUID(), dataUrl, createdAt: Date.now() };
    if (remember) refresh();
    signProps?.canvasRef.current?.addSignature(sig);
    setPadOpen(false);
  };

  const handleApply = async () => {
    const canvas = signProps?.canvasRef.current;
    const file = currentEntry?.file;
    if (!canvas || !file) return;
    if (!canvas.hasPlacements()) {
      setError(sp.addFirst);
      return;
    }
    // The entry this run belongs to, read before anything can await. The
    // thumbnail strip is not gated on the run, so the selection can move while
    // the PDF is being signed; a result written to the live selection would
    // land on a bystander entry and the signed file would go unguarded.
    const capturedIndex = useFileStore.getState().selectedIndex;
    // Which file that index held, so a failure finds its own entry even after
    // a reorder, and leaves alone a fresh file that took the slot.
    const capturedEntryId = useFileStore.getState().entries[capturedIndex]?.id;

    setError(null);
    setDownloadUrl(null);
    setProgress(0);
    setProcessing(true);
    // The state above draws this panel; the copy below is what the navigation
    // guard reads, and it is the only reason the store is touched here.
    // Clearing the entry's result also clears its claim (see the `claimed`
    // invariant in file-store), so a second run cannot inherit the first's.
    useFileStore.getState().setProcessing(true);
    runOwnedRef.current = true;
    useFileStore.getState().updateEntry(capturedIndex, {
      processedUrl: null,
      processedPreviewUrl: null,
      processedFilename: null,
      status: "pending",
      error: null,
    });

    /** Both copies of the flag, together. One cleared without the other leaves
     *  the guard warning about a run that is over, with no way to answer it. */
    const endRun = () => {
      runOwnedRef.current = false;
      setProcessing(false);
      useFileStore.getState().setProcessing(false);
    };

    /**
     * Ends a run that failed. Besides the panel's error and endRun, the
     * failure goes on the run's own entry, so the thumbnail strip marks it
     * failed and the page offers its report-issue button (#1969). `category`
     * is for messages that are translated, which can't be classified from
     * their text.
     *
     * Like use-tool-processor's endSyncRun, each write is guarded on its own
     * and the entry write always runs: a store listener that throws while the
     * run ends must not leave the entry pending. The first teardown error is
     * rethrown after it, so it still surfaces; the entry write itself logs and
     * reports instead of throwing. The entry is found by id, so a reorder or a
     * fresh file in the slot can't redirect the failure, and only the
     * "pending" the run reset it to is failed: an entry already holding this
     * run's result keeps it.
     */
    const failRun = (message: string, category?: FeedbackErrorCategory) => {
      let teardown: { cause: unknown } | null = null;
      for (const write of [() => setError(message), endRun]) {
        try {
          write();
        } catch (cause) {
          teardown ??= { cause };
        }
      }
      try {
        const { entries, updateEntry } = useFileStore.getState();
        const index = entries.findIndex((e) => e.id === capturedEntryId);
        if (index !== -1 && entries[index].status === "pending") {
          updateEntry(index, { status: "failed", error: message, errorCategory: category ?? null });
        }
      } catch (err) {
        console.error("Failing the Sign PDF run's entry failed", err);
        // The console alone never reaches Sentry (#1882).
        void captureHandledError(
          new SafeError("Failing a Sign PDF run's entry failed", { kind: "bug", cause: err }),
          { error_class: "bug", tool_id: "sign-pdf" },
        );
      }
      if (teardown) throw teardown.cause;
    };

    const exported = await canvas.exportPlacements().catch((cause: unknown) => {
      // Without this the run never ends: the button stays disabled and the
      // navigation guard warns for as long as the page is open. Reported
      // rather than swallowed, because catching it takes the rejection out of
      // Sentry's global handler.
      void captureHandledError(
        new SafeError("Signature export failed", { kind: "operational", cause }),
        { error_class: "operational", tool_id: "sign-pdf" },
      );
      return null;
    });
    if (!exported) {
      failRun(sp.exportFailed, "processing_error");
      return;
    }
    const { pngs, placements } = exported;
    const clientJobId = generateId();

    const finish = () => {
      progressCleanupRef.current = null;
      endRun();
    };

    /**
     * A fast sign answers twice: waitForJob returns 200 and the worker has
     * already published the terminal SSE frame, so both reach this panel for
     * one run. Only the first settles it, because a second write would reset
     * the claim the first one earned, and a result landing after the stream
     * failed the run would put the link up beside that error (#1885).
     */
    let settled = false;
    const landResult = (r: SignResult) => {
      if (settled) return;
      settled = true;
      const url = r.downloadUrl;
      useFileStore.getState().updateEntry(capturedIndex, {
        processedUrl: url,
        processedFilename: signedFilenameFrom(url),
        status: "completed",
        // processedSize stays null on purpose. tool-page renders its
        // ReviewPanel on `hasProcessed && processedSize != null`, and this
        // panel already offers the signed PDF, so filling the size in would
        // put a second download button beside this tool's own.
      });
      // An auto-saved result is already in the library, so it was never at risk.
      // Must follow the updateEntry above; see the `claimed` invariant in file-store.
      if (typeof r.savedFileId === "string") useFileStore.getState().markClaimed(capturedIndex);
      // Last, so a throw above never leaves the link up beside the error the
      // run ends with (#1354).
      setDownloadUrl(url);
    };

    // The request outlives a progress stream that gave up on the run (a failed
    // frame, or the stall timer, which upload progress pushes back; see below).
    // Abort it then, and drop whatever it answers after, or a late 200 puts the
    // signed PDF's link up beside the stall error and a late network error,
    // timeout, or 4xx replaces that error with its own (#1958).
    const xhr = new XMLHttpRequest();
    // Held so the unmount cleanup can abort it. Nothing clears the ref: abort
    // on a request that is already done does nothing.
    xhrRef.current = xhr;
    let abandoned = false;
    const abandonRequest = () => {
      settled = true;
      abandoned = true;
      xhr.abort();
    };

    const subscription = subscribeSignPdfJobProgress(clientJobId, {
      onProgress: (percent) => setProgress(percent),
      onComplete: (r) => {
        landResult(r);
        finish();
      },
      onFailed: (failure) => {
        abandonRequest();
        progressCleanupRef.current = null;
        // A failure with a reason shows one of our translated messages; a
        // server message is English and classifies from its text.
        failRun(
          jobFailureMessage(failure, t.errors),
          "message" in failure ? undefined : "processing_error",
        );
      },
      onStall: () => {
        abandonRequest();
        progressCleanupRef.current = null;
        failRun(sp.stall, "timeout");
      },
    });
    const stopProgress = subscription.stop;
    progressCleanupRef.current = stopProgress;

    const form = new FormData();
    form.append("file", file);
    form.append("placements", JSON.stringify(placements));
    form.append("clientJobId", clientJobId);
    // Forward the library file id (when the PDF came from the library) so the
    // worker auto-saves the signed result, honoring the chosen save mode
    // (new file by default, overwrite on request).
    if (currentEntry?.serverFileId) {
      form.append("fileId", currentEntry.serverFileId);
      form.append("saveMode", useFileStore.getState().librarySaveMode);
    }
    pngs.forEach((png, i) => {
      form.append(`sig${i}`, new File([png], `sig${i}.png`, { type: "image/png" }));
    });

    xhr.timeout = 600_000;
    // The stall timer is armed before the upload starts, and on a quiet stream
    // only this keeps it from cutting off a large PDF that is still uploading
    // (#1968). xhr.timeout still bounds the request as a whole.
    xhr.upload.onprogress = () => subscription.touch();
    xhr.onload = () => {
      // 202 = async: the progress subscription drives completion via SSE.
      if (abandoned || xhr.status === 202) return;
      stopProgress();
      progressCleanupRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        // Only a body that isn't a result is the server's fault, and it gets
        // reported (#1740). A throw while landing a good result is our own
        // store writes failing: it ends the run the way the progress stream's
        // handling error does, and still surfaces (#1354, the sync twin of
        // #1287).
        let result: SignResult | null = null;
        try {
          result = parseResultBody<SignResult>(xhr.responseText);
        } catch (err) {
          failRun(t.errors.invalidResponse, "processing_error");
          reportMalformedResult(err, { status: xhr.status, toolId: "sign-pdf" });
          return;
        }
        try {
          landResult(result);
        } catch (err) {
          try {
            failRun(jobFailureMessage({ reason: "trackingFailed" }, t.errors), "processing_error");
          } catch (teardownErr) {
            console.error("Ending the run after a result handling error failed", teardownErr);
            // The console alone never reaches Sentry (#1882).
            reportRunEndFailure(
              "Ending a Sign PDF run after a result handling error failed",
              teardownErr,
              "sign-pdf",
            );
          }
          throw err;
        }
        endRun();
        return;
      }
      let message: string;
      try {
        const b = JSON.parse(xhr.responseText);
        message =
          typeof b.error === "string"
            ? b.error
            : typeof b.details === "string"
              ? b.details
              : format(t.errors.failedWithStatus, { status: xhr.status });
      } catch {
        message = format(t.errors.processingFailedWithStatus, { status: xhr.status });
      }
      // A proxy's 413 has no JSON body, so its message is the translated
      // status line; the category is what says the upload was too big.
      failRun(message, xhr.status === 413 ? "upload_error" : undefined);
    };
    xhr.onerror = () => {
      if (abandoned) return;
      stopProgress();
      progressCleanupRef.current = null;
      failRun(t.errors.network, "upload_error");
    };
    xhr.ontimeout = () => {
      if (abandoned) return;
      stopProgress();
      progressCleanupRef.current = null;
      failRun(sp.timeout, "timeout");
    };
    xhr.open("POST", appUrl("/api/v1/tools/pdf/sign-pdf"));
    formatHeaders().forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(form);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {sp.yourSignatures}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {sigs.map((s) => (
            <div key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => signProps?.canvasRef.current?.addSignature(s)}
                className="h-9 min-w-[60px] rounded border border-border bg-background p-1"
              >
                <img
                  src={s.dataUrl}
                  alt={sp.savedSignature}
                  className="h-full w-full object-contain"
                />
              </button>
              <button
                type="button"
                aria-label={sp.deleteSignature}
                onClick={() => {
                  deleteSignature(s.id);
                  refresh();
                }}
                className="absolute -end-1 -top-1 hidden h-4 w-4 rounded-full bg-destructive text-[10px] text-white group-hover:block pointer-coarse:block"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPadOpen(true)}
            className="h-9 min-w-[60px] rounded border border-dashed border-border text-xs text-muted-foreground"
          >
            + {sp.newSignature}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{sp.clickToPlace}</p>
      </div>

      <div className="border-t border-border" />

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {sp.selectedSignature}
        </p>
        <button
          type="button"
          disabled={!signProps?.hasSelection}
          onClick={() => signProps?.canvasRef.current?.deleteSelected()}
          className="mt-2 rounded border border-border px-2 py-1 text-xs text-destructive disabled:opacity-40"
        >
          ✕ {t.common.delete}
        </button>
        <p className="mt-1 text-[11px] text-muted-foreground">{sp.dragToAdjust}</p>
      </div>

      <p className="text-[11px] text-muted-foreground">{sp.disclaimer}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {downloadUrl ? (
        <ResultDownloadLink
          href={downloadUrl}
          className="block w-full rounded-lg bg-primary py-2.5 text-center font-semibold text-primary-foreground"
        >
          {sp.downloadSigned}
        </ResultDownloadLink>
      ) : (
        <button
          type="button"
          disabled={processing || (signProps?.placementCount ?? 0) === 0}
          onClick={handleApply}
          className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {processing
            ? progress > 0
              ? format(sp.signingPercent, { percent: Math.round(progress) })
              : sp.signing
            : t.toolPage.applyAndDownload}
        </button>
      )}

      {padOpen && <SignaturePad onSave={handleSavePad} onCancel={() => setPadOpen(false)} />}
    </div>
  );
}
