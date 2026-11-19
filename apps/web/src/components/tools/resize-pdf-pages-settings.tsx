import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const PAGE_SIZES = ["4x6in", "100x150mm", "a4", "a5", "a6", "letter", "legal", "custom"] as const;
type PageSize = (typeof PAGE_SIZES)[number];
type Unit = "in" | "mm";

interface ResizeSettings {
  pageSize: PageSize;
  width: number;
  height: number;
  unit: Unit;
  keepOrientation: boolean;
}

const DEFAULTS: ResizeSettings = {
  pageSize: "4x6in",
  width: 4,
  height: 6,
  unit: "in",
  keepOrientation: false,
};

const MM_PER_INCH = 25.4;

const inputClass =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";

function ResizeFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: ResizeSettings;
  onChange: (next: ResizeSettings) => void;
}) {
  const { t } = useTranslation();
  const s = t.toolSettings["resize-pdf-pages"];
  const set = <K extends keyof ResizeSettings>(key: K, v: ResizeSettings[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-size`} className="text-xs text-muted-foreground">
          {s.pageSize}
        </label>
        <select
          id={`${idPrefix}-size`}
          value={value.pageSize}
          onChange={(e) => set("pageSize", e.target.value as PageSize)}
          className={inputClass}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {s.sizes[size]}
            </option>
          ))}
        </select>
      </div>

      {value.pageSize === "custom" && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor={`${idPrefix}-width`} className="text-xs text-muted-foreground">
              {s.width}
            </label>
            <input
              id={`${idPrefix}-width`}
              type="number"
              min={0}
              step={0.1}
              value={value.width}
              onChange={(e) => set("width", Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-height`} className="text-xs text-muted-foreground">
              {s.height}
            </label>
            <input
              id={`${idPrefix}-height`}
              type="number"
              min={0}
              step={0.1}
              value={value.height}
              onChange={(e) => set("height", Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-unit`} className="text-xs text-muted-foreground">
              {s.unit}
            </label>
            <select
              id={`${idPrefix}-unit`}
              value={value.unit}
              onChange={(e) => {
                const unit = e.target.value as Unit;
                if (unit === value.unit) return;
                // Keep the physical size when the unit flips, so 4 x 6 in becomes
                // 101.6 x 152.4 mm instead of an invalid 4 x 6 mm.
                const factor = unit === "mm" ? MM_PER_INCH : 1 / MM_PER_INCH;
                const convert = (v: number) => Math.round(v * factor * 100) / 100;
                onChange({
                  ...value,
                  unit,
                  width: convert(value.width),
                  height: convert(value.height),
                });
              }}
              className={inputClass}
            >
              <option value="in">in</option>
              <option value="mm">mm</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-orientation`}
          type="checkbox"
          checked={value.keepOrientation}
          onChange={(e) => set("keepOrientation", e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor={`${idPrefix}-orientation`} className="text-xs text-muted-foreground">
          {s.keepOrientation}
        </label>
      </div>
      <p className="text-[10px] text-muted-foreground">{s.fitHint}</p>
    </div>
  );
}

export function ResizePdfPagesSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["resize-pdf-pages"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("resize-pdf-pages");

  const [settings, setSettings] = useState<ResizeSettings>(DEFAULTS);

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    if (hasMultiple) {
      processAllFiles(files, { ...settings });
    } else {
      processFiles(files, { ...settings });
    }
  };

  return (
    <div className="space-y-4">
      <ResizeFields idPrefix="rpp" value={settings} onChange={setSettings} />

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
          data-testid="resize-pdf-pages-submit"
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

export interface ResizePdfPagesControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function ResizePdfPagesControls({
  settings: initial,
  onChange,
}: ResizePdfPagesControlsProps) {
  const [settings, setSettings] = useState<ResizeSettings>(DEFAULTS);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    setSettings((prev) => ({
      pageSize: PAGE_SIZES.includes(initial.pageSize as PageSize)
        ? (initial.pageSize as PageSize)
        : prev.pageSize,
      width: initial.width != null ? Number(initial.width) : prev.width,
      height: initial.height != null ? Number(initial.height) : prev.height,
      unit: initial.unit === "mm" || initial.unit === "in" ? initial.unit : prev.unit,
      keepOrientation:
        initial.keepOrientation != null ? Boolean(initial.keepOrientation) : prev.keepOrientation,
    }));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ ...settings });
  }, [settings]);

  return <ResizeFields idPrefix="rppc" value={settings} onChange={setSettings} />;
}
