import { Check, ChevronDown, ChevronRight, Copy, Download, Info } from "lucide-react";
import { useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { formatHeaders } from "@/lib/api";
import { copyToClipboard, generateId } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

type OcrQuality = "fast" | "balanced" | "best";

const QUALITY_OPTIONS: { value: OcrQuality; label: string }[] = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "best", label: "Best" },
];

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
  best: false,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

/** Send one file to the OCR API and return the extracted text. */
function ocrOneFile(
  file: File,
  settings: { quality: string; language: string; enhance: boolean },
  callbacks: {
    onUploadProgress: (pct: number) => void;
    onProcessingProgress: (pct: number, stage: string) => void;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientJobId = generateId();

    const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "single" && typeof data.percent === "number") {
          callbacks.onProcessingProgress(data.percent, data.stage);
        }
      } catch {}
    };
    es.onerror = () => es.close();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify(settings));
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) callbacks.onUploadProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      es.close();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).text ?? "");
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || body.details || `Failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Processing failed: ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => {
      es.close();
      reject(new Error("Network error"));
    };
    xhr.open("POST", "/api/v1/tools/ocr");
    for (const [key, value] of formatHeaders()) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

export function OcrSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [quality, setQuality] = useState<OcrQuality>("balanced");
  const [language, setLanguage] = useState("auto");
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
        const text = await ocrOneFile(file, settings, {
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
        });
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
      <SectionLabel>Quality</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {QUALITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleQualityChange(opt.value)}
            className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              quality === opt.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Enhance toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enhance}
          onChange={(e) => handleEnhanceToggle(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">Enhance before scanning</span>
        <span
          title="Automatically deskews, enhances contrast, removes noise, and upscales the image before scanning for better accuracy."
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground/60 text-[10px] cursor-help"
        >
          <Info className="h-2.5 w-2.5" />
        </span>
      </label>

      {/* Language (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground w-full pt-1"
        >
          {langOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Language
          <span className="ml-auto text-primary text-[10px] normal-case font-normal">
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
          label="Extracting text"
          stage={progressStage}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="ocr-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Extract Text (${files.length} files)` : "Extract Text"}
        </button>
      )}

      {/* Result */}
      {text !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Extracted Text</span>
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
              <p className="text-[10px] text-muted-foreground">{text.length} characters</p>
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
