import { Download, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";

const BARCODE_TYPES = [
  { value: "code128", label: "Code 128" },
  { value: "ean13", label: "EAN-13" },
  { value: "upca", label: "UPC-A" },
  { value: "code39", label: "Code 39" },
  { value: "itf14", label: "ITF-14" },
  { value: "datamatrix", label: "Data Matrix" },
] as const;

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

export function BarcodeGenerateSettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["barcode-generate"];

  const [text, setText] = useState("");
  const [type, setType] = useState("code128");
  const [scale, setScale] = useState(3);
  const [includeText, setIncludeText] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const canGenerate = text.trim().length > 0 && !generating;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setResultUrl(null);

    try {
      const res = await fetch("/api/v1/tools/barcode-generate", {
        method: "POST",
        headers: {
          ...formatHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim(), type, scale, includeText }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.downloadUrl) {
        setResultUrl(data.downloadUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate barcode");
    } finally {
      setGenerating(false);
    }
  }, [text, type, scale, includeText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canGenerate) handleGenerate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Text input */}
      <div>
        <label htmlFor="barcode-text" className="text-xs text-muted-foreground">
          {ts.text}
        </label>
        <input
          id="barcode-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text or number..."
          className={INPUT_CLASS}
          data-testid="barcode-input-text"
        />
      </div>

      {/* Barcode Type */}
      <div>
        <label htmlFor="barcode-type" className="text-xs text-muted-foreground">
          {ts.type}
        </label>
        <select
          id="barcode-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={INPUT_CLASS}
        >
          {BARCODE_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {bt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Scale */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="barcode-scale" className="text-xs text-muted-foreground">
            {ts.scale}
          </label>
          <span className="text-xs font-mono text-foreground">{scale}x</span>
        </div>
        <input
          id="barcode-scale"
          type="range"
          min={1}
          max={8}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      {/* Include Text */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={includeText}
          onChange={(e) => setIncludeText(e.target.checked)}
          className="rounded border-border"
        />
        {ts.includeText}
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Result preview */}
      {resultUrl && (
        <div className="space-y-2">
          <img
            src={resultUrl}
            alt="Generated barcode"
            className="w-full rounded border border-border bg-white p-2"
          />
          <a
            href={resultUrl}
            download="barcode.png"
            data-testid="barcode-generate-download"
            className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            {ts.download}
          </a>
        </div>
      )}

      {/* Generate button */}
      <button
        type="submit"
        data-testid="barcode-generate-submit"
        disabled={!canGenerate}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {generating && <Loader2 className="h-4 w-4 animate-spin" />}
        {ts.submit}
      </button>
    </form>
  );
}
