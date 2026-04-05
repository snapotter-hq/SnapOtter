import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";
export function BulkRenameSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [pattern, setPattern] = useState("image-{{index}}");
  const [startIndex, setStartIndex] = useState(1);
  const [downloadReady, setDownloadReady] = useState(false);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setDownloadReady(false);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append("settings", JSON.stringify({ pattern, startIndex }));

      const res = await fetch("/api/v1/tools/bulk-rename", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "renamed.zip";
      a.click();
      URL.revokeObjectURL(url);
      setDownloadReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFiles = files.length > 0;

  // Preview names
  const previewNames = hasFiles
    ? files.slice(0, 5).map((f, i) => {
        const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
        const idx = startIndex + i;
        const padded = String(idx).padStart(String(files.length + startIndex).length, "0");
        return (
          pattern
            .replace(/\{\{index\}\}/g, String(idx))
            .replace(/\{\{padded\}\}/g, padded)
            .replace(/\{\{original\}\}/g, f.name.replace(ext, "")) + ext
        );
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bulk-rename-pattern" className="text-xs text-muted-foreground">
          Pattern
        </label>
        <input
          id="bulk-rename-pattern"
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Variables: {"{{index}}"}, {"{{padded}}"}, {"{{original}}"}
        </p>
      </div>

      <div>
        <label htmlFor="bulk-rename-start-index" className="text-xs text-muted-foreground">
          Start Index
        </label>
        <input
          id="bulk-rename-start-index"
          type="number"
          value={startIndex}
          onChange={(e) => setStartIndex(Number(e.target.value))}
          min={0}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {previewNames.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Preview</p>
          <div className="mt-1 space-y-0.5">
            {previewNames.map((name) => (
              <div
                key={name}
                className="text-xs font-mono text-foreground bg-muted px-2 py-0.5 rounded truncate"
              >
                {name}
              </div>
            ))}
            {files.length > 5 && (
              <p className="text-[10px] text-muted-foreground">... and {files.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        data-testid="bulk-rename-submit"
        onClick={handleProcess}
        disabled={!hasFiles || processing || !pattern}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Renaming..." : `Rename ${files.length} Files`}
      </button>

      {downloadReady && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Download className="h-3 w-3" /> ZIP downloaded successfully
        </p>
      )}
    </div>
  );
}
