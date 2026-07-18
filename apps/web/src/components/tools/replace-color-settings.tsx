import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export interface ReplaceColorControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ReplaceColorControls({
  settings: initialSettings,
  onChange,
}: ReplaceColorControlsProps) {
  const [sourceColor, setSourceColor] = useState("#FF0000");
  const [targetColor, setTargetColor] = useState("#00FF00");
  const [makeTransparent, setMakeTransparent] = useState(false);
  const [tolerance, setTolerance] = useState(30);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.sourceColor != null) setSourceColor(String(initialSettings.sourceColor));
    if (initialSettings.targetColor != null) setTargetColor(String(initialSettings.targetColor));
    if (initialSettings.makeTransparent != null)
      setMakeTransparent(Boolean(initialSettings.makeTransparent));
    if (initialSettings.tolerance != null) setTolerance(Number(initialSettings.tolerance));
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({ sourceColor, targetColor, makeTransparent, tolerance });
  }, [sourceColor, targetColor, makeTransparent, tolerance]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="replace-source-color" className="text-xs text-muted-foreground">
          Source Color (to replace)
        </label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id="replace-source-color"
            type="color"
            value={sourceColor}
            onChange={(e) => setSourceColor(e.target.value)}
            className="w-10 h-8 rounded border border-border"
          />
          <span className="text-xs font-mono text-foreground">{sourceColor}</span>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={makeTransparent}
          onChange={(e) => setMakeTransparent(e.target.checked)}
          className="rounded"
        />
        Make transparent instead
      </label>

      {!makeTransparent && (
        <div>
          <label htmlFor="replace-target-color" className="text-xs text-muted-foreground">
            Target Color (replacement)
          </label>
          <div className="flex items-center gap-2 mt-0.5">
            <input
              id="replace-target-color"
              type="color"
              value={targetColor}
              onChange={(e) => setTargetColor(e.target.value)}
              className="w-10 h-8 rounded border border-border"
            />
            <span className="text-xs font-mono text-foreground">{targetColor}</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="replace-tolerance" className="text-xs text-muted-foreground">
            Tolerance
          </label>
          <span className="text-xs font-mono text-foreground">{tolerance}</span>
        </div>
        <input
          id="replace-tolerance"
          type="range"
          min={0}
          max={255}
          value={tolerance}
          onChange={(e) => setTolerance(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Exact match</span>
          <span>Wide range</span>
        </div>
      </div>
    </div>
  );
}

export function ReplaceColorSettings() {
  const { files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("replace-color");

  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <ReplaceColorControls onChange={setSettings} />

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

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
          type="button"
          data-testid="replace-color-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {files.length > 1 ? `Replace Color (${files.length} files)` : "Replace Color"}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="replace-color-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
