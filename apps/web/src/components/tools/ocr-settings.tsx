import { Check, ChevronDown, ChevronRight, Copy, Download, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { format } from "@/lib/format";
import { copyToClipboard, generateId } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
import { type OcrQuality, OcrQualityControl, useOcrQuality } from "./ocr-quality-control";

const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

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

/** Send one file to the OCR API and return the extracted text. */
export function ocrOneFile(
  file: File,
  settings: { quality: string; language: string; enhance: boolean },
  callbacks: {
    onUploadProgress: (pct: number) => void;
    onProcessingProgress: (pct: number, stage: string) => void;
  },
  messages: {
    timeout?: string;
    networkError?: string;
    processingFailed?: string;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientJobId = generateId();
    let settled = false;
    let asyncMode = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      es?.close();
      es = null;
    };

    const resolveOnce = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(text);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const armStallTimer = () => {
      if (settled) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        rejectOnce(
          new Error(
            messages.timeout ?? "OCR timed out with no progress. Try again or use a smaller image.",
          ),
        );
      }, OCR_ASYNC_STALL_TIMEOUT_MS);
    };

    try {
      es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    } catch {
      rejectOnce(new Error(messages.networkError ?? "Unable to subscribe to OCR progress"));
      return;
    }
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "heartbeat") {
          if (asyncMode) armStallTimer();
          return;
        }
        if (data.type !== "single") return;
        armStallTimer();
        if (data.phase === "complete" && data.result) {
          resolveOnce(typeof data.result.text === "string" ? data.result.text : "");
          return;
        }
        if (data.phase === "failed") {
          rejectOnce(new Error(typeof data.error === "string" ? data.error : "OCR failed"));
          return;
        }
        if (typeof data.percent === "number") {
          callbacks.onProcessingProgress(data.percent, data.stage);
        }
      } catch {}
    };
    // EventSource reconnects automatically. The progress endpoint replays the
    // terminal frame, so transient network loss must not discard a queued OCR.
    es.onerror = () => {};

    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify(settings));
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 600_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) callbacks.onUploadProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      // The BullMQ worker owns long OCR jobs. Keep the progress subscription
      // alive and resolve from buildLegacyResultPayload(resultPayload).text.
      if (xhr.status === 202) {
        asyncMode = true;
        armStallTimer();
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          resolveOnce(typeof body.text === "string" ? body.text : "");
        } catch {
          rejectOnce(new Error(messages.processingFailed ?? "Invalid response"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          rejectOnce(new Error(body.error || body.details || `Failed: ${xhr.status}`));
        } catch {
          rejectOnce(new Error(messages.processingFailed ?? `Processing failed: ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => rejectOnce(new Error(messages.networkError ?? "Network error"));
    xhr.ontimeout = () => rejectOnce(new Error(messages.timeout ?? "OCR request timed out"));
    xhr.onabort = () => rejectOnce(new Error(messages.processingFailed ?? "OCR request canceled"));
    xhr.open("POST", "/api/v1/tools/image/ocr");
    for (const [key, value] of formatHeaders()) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

export function OcrSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [language, setLanguage] = useState("auto");
  const { quality, setQuality, canRun } = useOcrQuality(language);
  const [enhance, setEnhance] = useState(false);
  const [enhanceManuallySet, setEnhanceManuallySet] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    setError(null);
    setText(null);
    setProcessing(true);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setProgressStage(undefined);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const settings = { quality, language, enhance };
    const total = files.length;
    const results: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const prefix = total > 1 ? `[${i + 1}/${total}] ` : "";
      // Each file gets an equal share of the 0-100 progress bar
      const fileBase = (i / total) * 100;
      const fileShare = 100 / total;

      try {
        const text = await ocrOneFile(
          file,
          settings,
          {
            onUploadProgress: (pct) => {
              setProgressPhase("uploading");
              setProgressPercent(fileBase + (pct / 100) * fileShare * 0.15);
              setProgressStage(`${prefix}Uploading...`);
            },
            onProcessingProgress: (pct, stage) => {
              setProgressPhase("processing");
              setProgressPercent(fileBase + fileShare * 0.15 + (pct / 100) * fileShare * 0.85);
              setProgressStage(`${prefix}${stage}`);
            },
          },
          {
            timeout: t.errors.timeout,
            networkError: t.errors.networkError,
            processingFailed: t.errors.processingFailed,
          },
        );
        results.push(total > 1 ? `--- ${file.name} ---\n${text || "(no text detected)"}` : text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.name}: ${msg}`);
        results.push(total > 1 ? `--- ${file.name} ---\n(error: ${msg})` : "");
      }
    }

    if (elapsedRef.current) clearInterval(elapsedRef.current);

    if (errors.length === total) {
      setError(errors.join("; "));
    } else if (errors.length > 0) {
      setError(`${errors.length} of ${total} files failed`);
    }

    setText(results.join("\n\n"));
    setProcessing(false);
    setProgressPhase("idle");
  };

  const handleCopy = async () => {
    if (text !== null) {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleDownload = () => {
    if (text === null) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const baseName =
      files.length === 1 ? (files[0]?.name?.replace(/\.[^.]+$/, "") ?? "extracted") : "ocr_results";
    a.href = url;
    a.download = `${baseName}_ocr.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasFile = files.length > 0;
  const langLabel = LANGUAGES.find((l) => l.code === language)?.label ?? "Auto-detect";

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
          Language
          <span className="ms-auto text-primary text-[10px] normal-case font-normal">
            {langLabel}
          </span>
        </button>
        {langOpen && (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full mt-1.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

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
                  Download
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          {text.length > 0 ? (
            <>
              <textarea
                data-testid="ocr-result-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={Math.min(16, Math.max(8, text.split("\n").length + 2))}
                className="w-full px-2 py-1.5 rounded border border-border bg-muted text-xs text-foreground font-mono resize-y"
              />
              <p className="text-[10px] text-muted-foreground">
                {format(t.toolSettings.ocr.characters, { count: text.length })}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic py-4 text-center">
              No text detected in this image
            </p>
          )}
        </div>
      )}
    </div>
  );
}
