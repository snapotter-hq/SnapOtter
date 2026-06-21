import { Check, ClipboardCopy, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

type ColorFormat = "hex" | "rgb" | "hsl";

export function ColorPaletteSettings() {
  const { t } = useTranslation();
  const ts = t.toolSettings["color-palette"];
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [count, setCount] = useState(8);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [colors, setColors] = useState<string[]>([]);
  const [hexColors, setHexColors] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedExport, setCopiedExport] = useState<"css" | "json" | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setColors([]);
    setHexColors([]);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("settings", JSON.stringify({ count, format }));

      const res = await fetch("/api/v1/tools/image/color-palette", {
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
      setHexColors(data.hex);
    } catch (err) {
      setError(err instanceof Error ? err.message : ts.extracting);
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

  const copyCss = async () => {
    const vars = hexColors.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n");
    const css = `:root {\n${vars}\n}`;
    const ok = await copyToClipboard(css);
    if (ok) {
      setCopiedExport("css");
      setTimeout(() => setCopiedExport(null), 1500);
    }
  };

  const copyJson = async () => {
    const ok = await copyToClipboard(JSON.stringify(colors));
    if (ok) {
      setCopiedExport("json");
      setTimeout(() => setCopiedExport(null), 1500);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      {/* Color count slider */}
      <div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Colors</span>
          <span className="text-xs font-mono text-foreground">{count}</span>
        </div>
        <input
          type="range"
          min={2}
          max={16}
          step={1}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full mt-1"
          data-testid="color-palette-count"
        />
      </div>

      {/* Format toggle */}
      <div>
        <span className="text-xs text-muted-foreground">Format</span>
        <div className="flex gap-1 mt-1">
          {(["hex", "rgb", "hsl"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFormat(f)}
              className={`flex-1 text-xs py-1.5 rounded ${format === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              data-testid={`color-palette-format-${f}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Extract button */}
      <button
        type="button"
        data-testid="color-palette-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {processing ? ts.extracting : ts.submit}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {colors.length > 0 && (
        <div className="space-y-3">
          {/* Full-width palette strip */}
          <div
            className="flex h-10 rounded overflow-hidden border border-border"
            data-testid="color-palette-strip"
          >
            {hexColors.map((hex) => (
              <div key={hex} className="flex-1" style={{ backgroundColor: hex }} />
            ))}
          </div>

          {/* Header + export buttons */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {ts.dominantColors} ({colors.length})
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={copyCss}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                data-testid="color-palette-copy-css"
              >
                {copiedExport === "css" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <ClipboardCopy className="h-3 w-3" />
                )}
                CSS
              </button>
              <button
                type="button"
                onClick={copyJson}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                data-testid="color-palette-copy-json"
              >
                {copiedExport === "json" ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <ClipboardCopy className="h-3 w-3" />
                )}
                JSON
              </button>
            </div>
          </div>

          {/* Swatch list */}
          <div className="grid grid-cols-2 gap-1.5">
            {colors.map((color, i) => (
              <button
                type="button"
                key={hexColors[i]}
                onClick={() => copyColor(color, i)}
                className="flex items-center gap-2 p-1.5 rounded border border-border hover:bg-muted transition-colors"
              >
                <div
                  className="w-6 h-6 rounded border border-border shrink-0"
                  style={{ backgroundColor: hexColors[i] }}
                />
                <span className="text-xs font-mono text-foreground flex-1 text-start truncate">
                  {color}
                </span>
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
