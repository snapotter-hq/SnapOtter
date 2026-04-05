import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatHeaders } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
export function ColorPaletteSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [colors, setColors] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setColors([]);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);

      const res = await fetch("/api/v1/tools/color-palette", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const data = await res.json();
      setColors(data.colors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setProcessing(false);
    }
  };

  const copyColor = async (color: string, idx: number) => {
    const ok = await copyToClipboard(color);
    if (ok) {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <button
        type="button"
        data-testid="color-palette-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Extracting..." : "Extract Colors"}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {colors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Dominant Colors ({colors.length})
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {colors.map((color, i) => (
              <button
                type="button"
                key={color}
                onClick={() => copyColor(color, i)}
                className="flex items-center gap-2 p-1.5 rounded border border-border hover:bg-muted transition-colors"
              >
                <div
                  className="w-6 h-6 rounded border border-border shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-mono text-foreground flex-1 text-left">{color}</span>
                {copiedIdx === i ? (
                  <Check className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
