import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function QrGenerateSettings() {
  const [text, setText] = useState("");
  const [size, setSize] = useState(400);
  const [errorCorrection, setErrorCorrection] = useState<"L" | "M" | "Q" | "H">("M");
  const [foreground, setForeground] = useState("#000000");
  const [background, setBackground] = useState("#FFFFFF");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);
    setPreviewUrl(null);

    try {
      const res = await fetch("/api/v1/tools/qr-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ text, size, errorCorrection, foreground, background }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Generation failed: ${res.status}`);
      }

      const result = await res.json();
      setDownloadUrl(result.downloadUrl);
      setPreviewUrl(result.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qr-text" className="text-xs text-muted-foreground">
          Text / URL
        </label>
        <textarea
          id="qr-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text or URL..."
          rows={3}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground resize-none"
        />
      </div>

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="qr-size" className="text-xs text-muted-foreground">
            Size
          </label>
          <span className="text-xs font-mono text-foreground">{size}px</span>
        </div>
        <input
          id="qr-size"
          type="range"
          min={100}
          max={2000}
          step={50}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-full mt-1"
        />
      </div>

      <div>
        <label htmlFor="qr-error-correction" className="text-xs text-muted-foreground">
          Error Correction
        </label>
        <select
          id="qr-error-correction"
          value={errorCorrection}
          onChange={(e) => setErrorCorrection(e.target.value as "L" | "M" | "Q" | "H")}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="L">Low (7%)</option>
          <option value="M">Medium (15%)</option>
          <option value="Q">Quartile (25%)</option>
          <option value="H">High (30%)</option>
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="qr-foreground" className="text-xs text-muted-foreground">
            Foreground
          </label>
          <input
            id="qr-foreground"
            type="color"
            value={foreground}
            onChange={(e) => setForeground(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="qr-background" className="text-xs text-muted-foreground">
            Background
          </label>
          <input
            id="qr-background"
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="w-full mt-0.5 h-8 rounded border border-border"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        data-testid="qr-generate-submit"
        onClick={handleGenerate}
        disabled={!text || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Generating..." : "Generate QR Code"}
      </button>

      {previewUrl && (
        <div className="flex flex-col items-center gap-2">
          <img
            src={previewUrl}
            alt="QR Code"
            className="max-w-full rounded border border-border"
            style={{ maxHeight: 200 }}
          />
          <a
            href={downloadUrl ?? undefined}
            download
            data-testid="qr-generate-download"
            className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            Download QR Code
          </a>
        </div>
      )}
    </div>
  );
}
