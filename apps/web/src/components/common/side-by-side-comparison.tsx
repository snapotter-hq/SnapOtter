import { useState } from "react";

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
  const [beforeDims, setBeforeDims] = useState<{ w: number; h: number } | null>(null);
  const [afterDims, setAfterDims] = useState<{ w: number; h: number } | null>(null);

  const savingsPercent =
    beforeSize && afterSize && beforeSize > 0
      ? ((1 - afterSize / beforeSize) * 100).toFixed(1)
      : null;

  const checkerboard = {
    backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%),
      linear-gradient(-45deg, #ccc 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ccc 75%),
      linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-3xl mx-auto">
      {/* Side-by-side images */}
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {/* Original */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Original
          </span>
          <div
            className="w-full aspect-video rounded-lg border border-border overflow-hidden flex items-center justify-center"
            style={checkerboard}
          >
            <img
              src={beforeSrc}
              alt="Original"
              className="max-w-full max-h-full object-contain"
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

        {/* Resized */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Resized
          </span>
          <div
            className="w-full aspect-video rounded-lg border border-border overflow-hidden flex items-center justify-center"
            style={checkerboard}
          >
            <img
              src={afterSrc}
              alt="Resized"
              className="max-w-full max-h-full object-contain"
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
          className={`text-sm font-medium ${Number(savingsPercent) > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
        >
          {Number(savingsPercent) > 0
            ? `${savingsPercent}% smaller`
            : `${Math.abs(Number(savingsPercent))}% larger`}
        </p>
      )}
    </div>
  );
}
