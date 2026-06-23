import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

type Target = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export function BlurPadSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["blur-pad"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("blur-pad");

  const [target, setTarget] = useState<Target>("16:9");
  const [blur, setBlur] = useState(20);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings = { target, blur };
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bp-target" className="text-xs text-muted-foreground">
          {s.target}
        </label>
        <select
          id="bp-target"
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
        <label htmlFor="bp-blur" className="text-xs text-muted-foreground">
          {s.blur}
        </label>
        <input
          id="bp-blur"
          type="number"
          min={2}
          max={50}
          step={1}
          value={blur}
          onChange={(e) => setBlur(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

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
          data-testid="blur-pad-submit"
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

export interface BlurPadControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function BlurPadControls({ settings: initial, onChange }: BlurPadControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["blur-pad"];
  const [target, setTarget] = useState<Target>("16:9");
  const [blur, setBlur] = useState(20);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.target != null) setTarget(initial.target as Target);
    if (initial.blur != null) setBlur(Number(initial.blur));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ target, blur });
  }, [target, blur]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bpp-target" className="text-xs text-muted-foreground">
          {s.target}
        </label>
        <select
          id="bpp-target"
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
        <label htmlFor="bpp-blur" className="text-xs text-muted-foreground">
          {s.blur}
        </label>
        <input
          id="bpp-blur"
          type="number"
          min={2}
          max={50}
          step={1}
          value={blur}
          onChange={(e) => setBlur(Number(e.target.value))}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
