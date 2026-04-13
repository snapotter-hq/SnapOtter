import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

const MODEL_OPTIONS = [
  { value: "gfpgan", label: "Fast" },
  { value: "auto", label: "Balanced" },
  { value: "codeformer", label: "Best" },
] as const;

export interface EnhanceFacesControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function EnhanceFacesControls({
  settings: initialSettings,
  onChange,
}: EnhanceFacesControlsProps) {
  const [model, setModel] = useState<"gfpgan" | "auto" | "codeformer">("auto");
  const [strength, setStrength] = useState(80);
  const [onlyCenterFace, setOnlyCenterFace] = useState(false);
  const [sensitivity, setSensitivity] = useState(50);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialSettings || initializedRef.current) return;
    initializedRef.current = true;
    if (initialSettings.model != null)
      setModel(initialSettings.model as "gfpgan" | "auto" | "codeformer");
    if (initialSettings.strength != null) setStrength(Number(initialSettings.strength) * 100);
    if (initialSettings.onlyCenterFace != null)
      setOnlyCenterFace(Boolean(initialSettings.onlyCenterFace));
    if (initialSettings.sensitivity != null)
      setSensitivity(Number(initialSettings.sensitivity) * 100);
  }, [initialSettings]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    onChangeRef.current?.({
      model,
      strength: strength / 100,
      onlyCenterFace,
      sensitivity: sensitivity / 100,
    });
  }, [model, strength, onlyCenterFace, sensitivity]);

  return (
    <div className="space-y-4">
      {/* Quality */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1.5">Quality</p>
        <div className="flex gap-1">
          {MODEL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setModel(value)}
              className={`flex-1 text-xs py-1.5 rounded ${
                model === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Enhancement Strength */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="enhance-faces-strength" className="text-xs text-muted-foreground">
            Enhancement Strength
          </label>
          <span className="text-xs font-mono text-foreground">{strength}%</span>
        </div>
        <input
          id="enhance-faces-strength"
          type="range"
          min={0}
          max={100}
          step={5}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-0.5">
          <span>Subtle</span>
          <span>Maximum</span>
        </div>
      </div>

      {/* Only enhance main face */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyCenterFace}
            onChange={(e) => setOnlyCenterFace(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-foreground">Only enhance main face</span>
        </label>
        <p className="text-[11px] text-muted-foreground/70 ml-6 mt-0.5">
          For portraits - ignores background faces
        </p>
      </div>

      {/* Detection Sensitivity */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="enhance-faces-sensitivity" className="text-xs text-muted-foreground">
            Detection Sensitivity
          </label>
          <span className="text-xs font-mono text-foreground">{sensitivity}%</span>
        </div>
        <input
          id="enhance-faces-sensitivity"
          type="range"
          min={10}
          max={90}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-0.5">
          <span>More faces</span>
          <span>Fewer faces</span>
        </div>
      </div>
    </div>
  );
}

export function EnhanceFacesSettings() {
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
  } = useToolProcessor("enhance-faces");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const handleProcess = () => {
    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  return (
    <div className="space-y-4">
      <EnhanceFacesControls onChange={setSettings} />

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Enhanced: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process buttons / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={hasMultiple ? `Enhancing ${files.length} images` : "Enhancing faces"}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="enhance-faces-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {hasMultiple ? `Enhance Faces (${files.length} files)` : "Enhance Faces"}
        </button>
      )}

      {/* Download (single file - batch uses Download All ZIP in tool-page) */}
      {!hasMultiple && downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="enhance-faces-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
