import { SafeError } from "@snapotter/shared";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { format } from "@/lib/format";
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

interface ProgressHandlers {
  onProgress?: (percent: number) => void;
  onComplete: (result: Record<string, unknown>) => void;
  onFailed: (error: string) => void;
  onStall: () => void;
}

/**
 * Subscribe to async (202) job progress with the same mobile-resilient recovery
 * as the standard tool processor (PRs #203/#204). Reconnects on tab refocus (the
 * progress endpoint replays the terminal frame from Redis and, after that cache
 * expires, from the durable job record, so a job that finished while SSE was dead
 * still resolves) and arms a stall timeout that fails gracefully instead of
 * hanging at the last percent. Returns a cleanup the caller must invoke on sync
 * completion, error, or unmount.
 */
export function subscribeSignPdfJobProgress(
  clientJobId: string,
  handlers: ProgressHandlers,
): () => void {
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
      try {
        const data = JSON.parse(event.data);
        if (data.type === "heartbeat") {
          resetStall();
          return;
        }
        if (data.type !== "single") return;
        resetStall();
        if (data.phase === "complete" && data.result) {
          cleanup();
          handlers.onComplete(data.result as Record<string, unknown>);
          return;
        }
        if (data.phase === "failed") {
          cleanup();
          handlers.onFailed(typeof data.error === "string" ? data.error : "Processing failed");
          return;
        }
        if (typeof data.percent === "number") handlers.onProgress?.(data.percent);
      } catch {
        // Ignore malformed SSE frames
      }
    };
    // A transient drop triggers the browser's built-in reconnect; on reconnect
    // the backend replays the terminal frame, so a completed job still resolves.
    es.onerror = () => {};
  }

  document.addEventListener("visibilitychange", onVisible);
  open();
  resetStall();
  return cleanup;
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
      setError("Could not read the placed signatures. Try again.");
      endRun();
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
     * one run. Only the first writes, because a second write would reset the
     * claim the first one earned.
     */
    let landed = false;
    const landResult = (r: Record<string, unknown>) => {
      if (landed) return;
      const url = typeof r.downloadUrl === "string" ? r.downloadUrl : null;
      if (!url) {
        setError("Invalid response");
        return;
      }
      landed = true;
      setDownloadUrl(url);
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
    };

    const stopProgress = subscribeSignPdfJobProgress(clientJobId, {
      onProgress: (percent) => setProgress(percent),
      onComplete: (r) => {
        landResult(r);
        finish();
      },
      onFailed: (err) => {
        setError(err);
        finish();
      },
      onStall: () => {
        setError(
          "Processing timed out. The result may have saved to your files; otherwise, try again.",
        );
        finish();
      },
    });
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

    const xhr = new XMLHttpRequest();
    // Held so the unmount cleanup can abort it. Nothing clears the ref: abort
    // on a request that is already done does nothing.
    xhrRef.current = xhr;
    xhr.timeout = 600_000;
    xhr.onload = () => {
      // 202 = async: the progress subscription drives completion via SSE.
      if (xhr.status === 202) return;
      stopProgress();
      progressCleanupRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          landResult(JSON.parse(xhr.responseText));
        } catch {
          setError("Invalid response");
        }
      } else {
        try {
          const b = JSON.parse(xhr.responseText);
          setError(
            typeof b.error === "string"
              ? b.error
              : typeof b.details === "string"
                ? b.details
                : `Failed: ${xhr.status}`,
          );
        } catch {
          setError(`Processing failed: ${xhr.status}`);
        }
      }
      endRun();
    };
    xhr.onerror = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Network error");
      endRun();
    };
    xhr.ontimeout = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Request timed out. Try again.");
      endRun();
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
