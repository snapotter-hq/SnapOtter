import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatHeaders } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
export function BarcodeReadSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [result, setResult] = useState<{ found: boolean; text: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);

      const res = await fetch("/api/v1/tools/barcode-read", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reading failed");
    } finally {
      setProcessing(false);
    }
  };

  const copyText = async () => {
    if (!result?.text) return;
    const ok = await copyToClipboard(result.text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload an image containing a QR code to decode its content.
      </p>

      <button
        type="button"
        data-testid="barcode-read-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Reading..." : "Read Barcode"}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="p-3 rounded-lg bg-muted space-y-2">
          {result.found ? (
            <>
              <p className="text-xs text-muted-foreground">Decoded Text:</p>
              <p className="text-sm text-foreground font-mono break-all">{result.text}</p>
              <button
                type="button"
                onClick={copyText}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy to clipboard
                  </>
                )}
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No QR code found in the image.</p>
          )}
        </div>
      )}
    </div>
  );
}
