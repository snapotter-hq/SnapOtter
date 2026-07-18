import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { format } from "@/lib/format";

interface SideBySideComparisonProps {
  beforeSrc: string;
  afterSrc: string;
  beforeSize?: number;
  afterSize?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SideBySideComparison({
  beforeSrc,
  afterSrc,
  beforeSize,
  afterSize,
}: SideBySideComparisonProps) {
  const { t } = useTranslation();
  const [beforeDims, setBeforeDims] = useState<{ w: number; h: number } | null>(null);
  const [afterDims, setAfterDims] = useState<{ w: number; h: number } | null>(null);

  const savingsPercent =
    beforeSize && afterSize && beforeSize > 0
      ? ((1 - afterSize / beforeSize) * 100).toFixed(1)
      : null;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-3xl mx-auto">
      {/* Side-by-side images */}
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {/* Original */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t.comparison.original}
          </span>
          <div className="w-full rounded-lg border border-border overflow-hidden flex items-center justify-center bg-muted/30 p-2 min-h-[200px] max-h-[60dvh]">
            <img
              src={beforeSrc}
              alt="Original"
              className="max-w-full max-h-[56dvh] object-contain rounded-sm"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setBeforeDims({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center space-y-0.5">
            {beforeDims && (
              <p>
                {beforeDims.w} x {beforeDims.h}
              </p>
            )}
            {beforeSize != null && <p>{formatSize(beforeSize)}</p>}
          </div>
        </div>

        {/* Processed */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t.comparison.processed}
          </span>
          <div className="w-full rounded-lg border border-border overflow-hidden flex items-center justify-center bg-muted/30 p-2 min-h-[200px] max-h-[60dvh]">
            <img
              src={afterSrc}
              alt="Processed"
              className="max-w-full max-h-[56dvh] object-contain rounded-sm"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setAfterDims({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center space-y-0.5">
            {afterDims && (
              <p>
                {afterDims.w} x {afterDims.h}
              </p>
            )}
            {afterSize != null && <p>{formatSize(afterSize)}</p>}
          </div>
        </div>
      </div>

      {/* Size savings */}
      {savingsPercent !== null && (
        <p
          className={`text-sm font-medium ${Number(savingsPercent) > 0 ? "text-success-ink" : "text-destructive-ink"}`}
        >
          {Number(savingsPercent) > 0
            ? format(t.toolSettings["optimize-for-web"].smaller, { percent: savingsPercent })
            : format(t.toolSettings["optimize-for-web"].larger, {
                percent: Math.abs(Number(savingsPercent)),
              })}
        </p>
      )}
    </div>
  );
}
