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
  fast: true,
  balanced: true,
  best: false,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

export function OcrSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [quality, setQuality] = useState<OcrQuality>("balanced");
  const [language, setLanguage] = useState("auto");
  const [enhance, setEnhance] = useState(true);
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
    // Update enhance default unless user has manually toggled it
    if (!enhanceManuallySet) {
      setEnhance(ENHANCE_DEFAULTS[q]);
    }
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

    const clientJobId = generateId();

    const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "single" && typeof data.percent === "number") {
          setProgressPhase("processing");
          setProgressPercent(15 + (data.percent / 100) * 85);
          setProgressStage(data.stage);
        }
      } catch {}
    };
    es.onerror = () => es.close();

    const formData = new FormData();
    formData.append("file", files[0]);
    formData.append("settings", JSON.stringify({ quality, language, enhance }));
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgressPercent((e.loaded / e.total) * 15);
      }
    };
    xhr.upload.onload = () => {
      setProgressPhase("processing");
      setProgressPercent(15);
      setProgressStage("Starting...");
    };
    xhr.onload = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      es.close();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setText(data.text ?? "");
        } catch {
          setError("Invalid response");
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(body.error || body.details || `Failed: ${xhr.status}`);
        } catch {
          setError(`Processing failed: ${xhr.status}`);
        }
      }
      setProcessing(false);
      setProgressPhase("idle");
    };
    xhr.onerror = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      es.close();
      setError("Network error");
      setProcessing(false);
      setProgressPhase("idle");
    };
    xhr.open("POST", "/api/v1/tools/ocr");
    formatHeaders().forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
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
    const baseName = files[0]?.name?.replace(/\.[^.]+$/, "") ?? "extracted";
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
          Extract Text
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
                rows={8}
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
