import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { BgPreviewState } from "@/components/common/image-viewer";
import { useTranslation } from "@/contexts/i18n-context";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface BeforeAfterSliderProps {
  /** URL or data URL of original image. */
  beforeSrc: string;
  /** URL or data URL of processed image. */
  afterSrc: string;
  /** Original file size in bytes. */
  beforeSize?: number;
  /** Processed file size in bytes. */
  afterSize?: number;
  /** Initial divider position as a percentage (0-100). Defaults to 50. */
  initialPosition?: number;
  /** Optional CSS preview layers for the "after" panel (remove-bg effects). */
  bgPreview?: BgPreviewState | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeSize,
  afterSize,
  initialPosition = 50,
  bgPreview,
}: BeforeAfterSliderProps) {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition); // percentage 0-100
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (isMobile) {
        const y = clientY - rect.top;
        const pct = Math.max(0, Math.min(100, (y / rect.height) * 100));
        setPosition(pct);
      } else {
        const x = clientX - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setPosition(pct);
      }
    },
    [isMobile],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX, e.clientY);
    },
    [updatePosition],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX, e.clientY);
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

  const hasBgLayers = bgPreview && (bgPreview.containerBackground || bgPreview.backgroundSrc);

  const [contentBox, setContentBox] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const handleAfterImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const cw = img.clientWidth;
    const ch = img.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const scale = Math.min(cw / nw, ch / nh);
    const rw = nw * scale;
    const rh = nh * scale;
    setContentBox({
      left: (cw - rw) / 2,
      top: (ch - rh) / 2,
      width: rw,
      height: rh,
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl mx-auto h-full min-h-0">
      {/* Slider container */}
      <div
        ref={containerRef}
        role="slider"
        aria-label={t.a11y.beforeAfterSlider}
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative w-full overflow-hidden rounded-lg border border-border select-none touch-none"
        style={{ cursor: isDragging ? (isMobile ? "ns-resize" : "ew-resize") : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (isMobile) {
            if (e.key === "ArrowUp") setPosition((p) => Math.max(0, p - 1));
            else if (e.key === "ArrowDown") setPosition((p) => Math.min(100, p + 1));
          } else {
            if (e.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 1));
            else if (e.key === "ArrowRight") setPosition((p) => Math.min(100, p + 1));
          }
        }}
      >
        {/* Before image (full width, bottom layer) */}
        <img
          src={beforeSrc}
          alt="Original"
          className="block w-full max-h-[70dvh] object-contain"
          draggable={false}
        />

        {/* After panel (clipped, top layer) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: isMobile ? `inset(${position}% 0 0 0)` : `inset(0 0 0 ${position}%)`,
          }}
        >
          {/* Background layers constrained to the image content area */}
          {contentBox && (
            <div
              className="absolute overflow-hidden"
              style={{
                top: contentBox.top,
                left: contentBox.left,
                width: contentBox.width,
                height: contentBox.height,
                ...(hasBgLayers ? {} : CHECKERBOARD_STYLE),
              }}
            >
              {bgPreview?.backgroundSrc ? (
                <img
                  src={bgPreview.backgroundSrc}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: bgPreview.backgroundBlur || undefined }}
                  draggable={false}
                />
              ) : bgPreview?.containerBackground ? (
                <div
                  className="absolute inset-0"
                  style={{ background: bgPreview.containerBackground }}
                />
              ) : null}
            </div>
          )}

          {/* Processed image */}
          <img
            src={afterSrc}
            alt="Processed"
            className="relative w-full h-full object-contain"
            style={{ filter: bgPreview?.dropShadow || undefined }}
            onLoad={handleAfterImgLoad}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        {isMobile ? (
          <div
            className="absolute inset-x-0 h-0.5 bg-white pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_6px_rgba(0,0,0,0.35)]"
            style={{ top: `${position}%`, transform: "translateY(-50%)" }}
          >
            {/* Handle grip */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.35)] flex items-center justify-center pointer-events-none">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="text-primary rotate-90"
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
        ) : (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_6px_rgba(0,0,0,0.35)]"
            style={{ left: `${position}%`, transform: "translateX(-50%)" }}
          >
            {/* Handle grip */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.35)] flex items-center justify-center pointer-events-none">
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
        )}

        {/* Labels */}
        <div
          className={cn(
            "absolute px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium pointer-events-none",
            isMobile ? "top-2 start-2" : "top-2 left-2",
          )}
        >
          {t.comparison.original}
        </div>
        <div
          className={cn(
            "absolute px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium pointer-events-none",
            isMobile ? "bottom-2 end-2" : "top-2 right-2",
          )}
        >
          {t.comparison.processed}
        </div>
      </div>

      {/* Size comparison badges */}
      {beforeSize != null && afterSize != null && (
        <div className="flex items-center gap-4 text-xs">
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
            Original: {formatSize(beforeSize)}
          </span>
          <span className="px-2 py-1 rounded bg-primary/10 text-primary-ink font-medium">
            Processed: {formatSize(afterSize)}
            {savingsPercent !== null && Number(savingsPercent) > 0 && (
              <span className="ms-1">({savingsPercent}% smaller)</span>
            )}
            {savingsPercent !== null && Number(savingsPercent) < 0 && (
              <span className="ms-1">({Math.abs(Number(savingsPercent))}% larger)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
