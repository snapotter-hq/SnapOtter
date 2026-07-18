import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Target = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export function AspectPadSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["aspect-pad"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("aspect-pad");

  const [target, setTarget] = useState<Target>("9:16");
  const [color, setColor] = useState("#000000");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { target, color };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ap-target" className="text-xs text-muted-foreground">
          {s.target}
        </label>
        <select
          id="ap-target"
          value={target}
          onChange={(e) => setTarget(e.target.value as Target)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
        </select>
      </div>

      <div>
        <label htmlFor="ap-color" className="text-xs text-muted-foreground">
          {s.color}
        </label>
        <input
          id="ap-color"
          type="text"
          maxLength={7}
          placeholder="#RRGGBB"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{s.colorHint}</p>
      </div>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="aspect-pad-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface AspectPadControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function AspectPadControls({ settings: initial, onChange }: AspectPadControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["aspect-pad"];
  const [target, setTarget] = useState<Target>("9:16");
  const [color, setColor] = useState("#000000");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.target != null) setTarget(initial.target as Target);
    if (initial.color != null) setColor(String(initial.color));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ target, color });
  }, [target, color]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="app-target" className="text-xs text-muted-foreground">
          {s.target}
        </label>
        <select
          id="app-target"
          value={target}
          onChange={(e) => setTarget(e.target.value as Target)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
        </select>
      </div>
      <div>
        <label htmlFor="app-color" className="text-xs text-muted-foreground">
          {s.color}
        </label>
        <input
          id="app-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full mt-0.5 h-8 rounded border border-border bg-background"
        />
      </div>
    </div>
  );
}
