import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  /** URL or data URL of original image. */
  beforeSrc: string;
  /** URL or data URL of processed image. */
  afterSrc: string;
  /** Original file size in bytes. */
  beforeSize?: number;
  /** Processed file size in bytes. */
  afterSize?: number;
  /** Initial divider position as a percentage (0–100). Defaults to 50. */
  initialPosition?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Before/After image comparison slider.
 *
 * Shows two images overlapping with a draggable vertical divider.
 * The "before" image is on the left, "after" on the right.
 * Supports mouse and touch interaction via pointer events.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeSize,
  afterSize,
  initialPosition = 50,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition); // percentage 0-100
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    },
    [isDragging, updatePosition],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Prevent default drag behavior on images
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const preventDrag = (e: Event) => e.preventDefault();
    container.addEventListener("dragstart", preventDrag);
    return () => container.removeEventListener("dragstart", preventDrag);
  }, []);

  const savingsPercent =
    beforeSize && afterSize && beforeSize > 0
      ? ((1 - afterSize / beforeSize) * 100).toFixed(1)
      : null;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl mx-auto h-full min-h-0">
      {/* Slider container */}
      <div
        ref={containerRef}
        role="slider"
        aria-label="Before/after comparison slider"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative w-full overflow-hidden rounded-lg border border-border select-none touch-none"
        style={{ cursor: isDragging ? "ew-resize" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 1));
          else if (e.key === "ArrowRight") setPosition((p) => Math.min(100, p + 1));
        }}
      >
        {/* Before image (full width, bottom layer) */}
        <img
          src={beforeSrc}
          alt="Original"
          className="block w-full max-h-[70vh] object-contain"
          draggable={false}
        />

        {/* After image (clipped, top layer) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 0 0 ${position}%)`,
            backgroundImage:
              "linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
            backgroundColor: "#f9fafb",
          }}
        >
          <img
            src={afterSrc}
            alt="Processed"
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        >
          {/* Handle grip */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-primary shadow-lg flex items-center justify-center pointer-events-none">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-primary"
              aria-hidden="true"
            >
              <path
                d="M4 3L1 7L4 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 3L13 7L10 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium pointer-events-none">
          Original
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium pointer-events-none">
          Processed
        </div>
      </div>

      {/* Size comparison badges */}
      {beforeSize != null && afterSize != null && (
        <div className="flex items-center gap-4 text-xs">
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
            Original: {formatSize(beforeSize)}
          </span>
          <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">
            Processed: {formatSize(afterSize)}
            {savingsPercent !== null && Number(savingsPercent) > 0 && (
              <span className="ml-1">({savingsPercent}% smaller)</span>
            )}
            {savingsPercent !== null && Number(savingsPercent) < 0 && (
              <span className="ml-1">({Math.abs(Number(savingsPercent))}% larger)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
