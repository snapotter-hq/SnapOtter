import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFileStore } from "@/stores/file-store";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

export function SplitSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [columns, setColumns] = useState(2);
  const [rows, setRows] = useState(2);
  const [downloadReady, setDownloadReady] = useState(false);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError(null);
    setDownloadReady(false);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("settings", JSON.stringify({ columns, rows }));

      const res = await fetch("/api/v1/tools/split", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed: ${res.status}`);
      }

      // Download the ZIP
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `split-${columns}x${rows}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;
  const presets = [
    { label: "2x2", c: 2, r: 2 },
    { label: "3x3", c: 3, r: 3 },
    { label: "1x3", c: 1, r: 3 },
    { label: "3x1", c: 3, r: 1 },
    { label: "4x4", c: 4, r: 4 },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Grid Presets</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setColumns(p.c);
                setRows(p.r);
              }}
              className={`text-xs px-2 py-1 rounded ${columns === p.c && rows === p.r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="split-columns" className="text-xs text-muted-foreground">
            Columns
          </label>
          <input
            id="split-columns"
            type="number"
            value={columns}
            onChange={(e) => setColumns(Math.max(1, Number(e.target.value)))}
            min={1}
            max={10}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="split-rows" className="text-xs text-muted-foreground">
            Rows
          </label>
          <input
            id="split-rows"
            type="number"
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
            min={1}
            max={10}
            className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Will produce {columns * rows} parts</p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        data-testid="split-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Splitting..." : "Split Image"}
      </button>

      {downloadReady && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Download className="h-3 w-3" /> ZIP downloaded successfully
        </p>
      )}
    </div>
  );
}
