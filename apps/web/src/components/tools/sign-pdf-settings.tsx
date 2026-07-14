import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
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
      es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
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

  // Tear down any live SSE subscription if the panel unmounts mid-job.
  useEffect(() => () => progressCleanupRef.current?.(), []);

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
    setError(null);
    setDownloadUrl(null);
    setProgress(0);
    setProcessing(true);

    const { pngs, placements } = await canvas.exportPlacements();
    const clientJobId = generateId();

    const finish = () => {
      progressCleanupRef.current = null;
      setProcessing(false);
    };

    const stopProgress = subscribeSignPdfJobProgress(clientJobId, {
      onProgress: (percent) => setProgress(percent),
      onComplete: (r) => {
        setDownloadUrl(r.downloadUrl as string);
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
    // worker auto-saves the signed result as a new version.
    if (currentEntry?.serverFileId) form.append("fileId", currentEntry.serverFileId);
    pngs.forEach((png, i) => {
      form.append(`sig${i}`, new File([png], `sig${i}.png`, { type: "image/png" }));
    });

    const xhr = new XMLHttpRequest();
    xhr.timeout = 600_000;
    xhr.onload = () => {
      // 202 = async: the progress subscription drives completion via SSE.
      if (xhr.status === 202) return;
      stopProgress();
      progressCleanupRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          setDownloadUrl(JSON.parse(xhr.responseText).downloadUrl);
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
      setProcessing(false);
    };
    xhr.onerror = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Network error");
      setProcessing(false);
    };
    xhr.ontimeout = () => {
      stopProgress();
      progressCleanupRef.current = null;
      setError("Request timed out. Try again.");
      setProcessing(false);
    };
    xhr.open("POST", "/api/v1/tools/pdf/sign-pdf");
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
                  alt="saved signature"
                  className="h-full w-full object-contain"
                />
              </button>
              <button
                type="button"
                aria-label="delete signature"
                onClick={() => {
                  deleteSignature(s.id);
                  refresh();
                }}
                className="absolute -end-1 -top-1 hidden h-4 w-4 rounded-full bg-destructive text-[10px] text-white group-hover:block"
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
        <a
          href={downloadUrl}
          download
          className="block w-full rounded-lg bg-primary py-2.5 text-center font-semibold text-primary-foreground"
        >
          {sp.downloadSigned}
        </a>
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
