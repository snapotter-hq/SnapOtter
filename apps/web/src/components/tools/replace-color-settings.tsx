import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

export function ReplaceColorSettings() {
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("replace-color");

  const [sourceColor, setSourceColor] = useState("#FF0000");
  const [targetColor, setTargetColor] = useState("#00FF00");
  const [makeTransparent, setMakeTransparent] = useState(false);
  const [tolerance, setTolerance] = useState(30);

  const handleProcess = () => {
    const settings = { sourceColor, targetColor, makeTransparent, tolerance };
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground">Source Color (to replace)</label>
        <div className="flex items-center gap-2 mt-0.5">
          <input type="color" value={sourceColor} onChange={(e) => setSourceColor(e.target.value)} className="w-10 h-8 rounded border border-border" />
          <span className="text-xs font-mono text-foreground">{sourceColor}</span>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={makeTransparent} onChange={(e) => setMakeTransparent(e.target.checked)} className="rounded" />
        Make transparent instead
      </label>

      {!makeTransparent && (
        <div>
          <label className="text-xs text-muted-foreground">Target Color (replacement)</label>
          <div className="flex items-center gap-2 mt-0.5">
            <input type="color" value={targetColor} onChange={(e) => setTargetColor(e.target.value)} className="w-10 h-8 rounded border border-border" />
            <span className="text-xs font-mono text-foreground">{targetColor}</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center">
          <label className="text-xs text-muted-foreground">Tolerance</label>
          <span className="text-xs font-mono text-foreground">{tolerance}</span>
        </div>
        <input type="range" min={0} max={255} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full mt-1" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Exact match</span>
          <span>Wide range</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Replacing color"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Replace Color (${files.length} files)` : "Replace Color"}
        </button>
      )}

      {downloadUrl && (
        <a href={downloadUrl} download className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5">
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
