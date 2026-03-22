import { useState, useRef } from "react";
import { useFileStore } from "@/stores/file-store";
import { ProgressCard } from "@/components/common/progress-card";
import { Copy, Check } from "lucide-react";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

type OcrEngine = "tesseract" | "paddleocr";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

export function OcrSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [engine, setEngine] = useState<OcrEngine>("tesseract");
  const [language, setLanguage] = useState("en");
  const [text, setText] = useState<string | null>(null);
  const [detectedEngine, setDetectedEngine] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setText(null);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setProgressStage(undefined);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const clientJobId = crypto.randomUUID();

    // Open SSE for server-side progress
    const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "single" && typeof data.percent === "number") {
          setProgressPhase("processing");
          setProgressPercent(data.percent);
          setProgressStage(data.stage);
        }
      } catch {}
    };
    es.onerror = () => es.close();

    const formData = new FormData();
    formData.append("file", files[0]);
    formData.append("settings", JSON.stringify({ engine, language }));
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgressPercent((e.loaded / e.total) * 100);
      }
    };
    xhr.upload.onload = () => {
      setProgressPhase("processing");
      setProgressPercent(0);
      setProgressStage("Starting...");
    };
    xhr.onload = () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      es.close();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setText(data.text || "");
          setDetectedEngine(data.engine || engine);
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
    xhr.setRequestHeader("Authorization", `Bearer ${getToken()}`);
    xhr.send(formData);
  };

  const handleCopy = async () => {
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Engine selector */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">OCR Engine</label>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => setEngine("tesseract")}
            className={`flex-1 text-xs py-1.5 rounded ${
              engine === "tesseract"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Tesseract
          </button>
          <button
            onClick={() => setEngine("paddleocr")}
            className={`flex-1 text-xs py-1.5 rounded ${
              engine === "paddleocr"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            PaddleOCR
          </button>
        </div>
      </div>

      {/* Language selector */}
      <div>
        <label className="text-xs text-muted-foreground">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process button */}
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
            <label className="text-xs font-medium text-muted-foreground">
              Extracted Text ({detectedEngine})
            </label>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea
            readOnly
            value={text}
            rows={8}
            className="w-full px-2 py-1.5 rounded border border-border bg-muted text-xs text-foreground font-mono resize-y"
          />
          {text.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {text.length} characters extracted
            </p>
          )}
        </div>
      )}
    </div>
  );
}
