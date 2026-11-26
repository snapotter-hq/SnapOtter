import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import {
  blockCentre,
  estimateBlockPercent,
  pointerToPlacement,
  type Size,
  type TextOverlayLayout,
} from "@/lib/text-overlay-placement";

export interface TextOverlayCanvasProps {
  imageSrc: string;
  layout: TextOverlayLayout | null;
  onPlace: (placement: { x: number; y: number }) => void;
}

const NUDGE = 1;
const NUDGE_LARGE = 10;

export function TextOverlayCanvas({ imageSrc, layout, onPlace }: TextOverlayCanvasProps) {
  const { t } = useTranslation();
  const ts = t.toolSettings["text-overlay"];
  const frameRef = useRef<HTMLDivElement>(null);
  // Pixel gap between the pointer and the box centre at grab time, so the box doesn't jump.
  const grabRef = useRef<{ dx: number; dy: number } | null>(null);
  const [image, setImage] = useState<Size | null>(null);
  const [renderedWidth, setRenderedWidth] = useState(0);

  // The preview text scales with the drawn image, so track its width. A CSS container query
  // would do it, but inline-size containment collapses a shrink-to-fit frame to nothing.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setRenderedWidth(frame.clientWidth));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const block = layout && image ? estimateBlockPercent(layout, image) : null;
  const centre = layout && image && block ? blockCentre(layout, block, image) : null;

  const place = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame || !block) return;
    onPlace(pointerToPlacement({ clientX, clientY }, frame.getBoundingClientRect(), block));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!centre || !block) return;
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[e.key];
    if (!move) return;
    e.preventDefault();
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    place(
      frame.left + ((centre.x + move[0]) / 100) * frame.width,
      frame.top + ((centre.y + move[1]) / 100) * frame.height,
    );
  };

  return (
    <div className="flex flex-col w-full h-full max-w-4xl mx-auto">
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-muted/20 p-4 min-h-0">
        <div ref={frameRef} className="relative inline-block select-none touch-none">
          <img
            src={imageSrc}
            alt={ts.previewImage}
            onLoad={(e) =>
              setImage({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            className="block max-w-full max-md:max-h-full md:max-h-[calc(100dvh-12rem)]"
            draggable={false}
          />
          {layout && image && block && centre && (
            <button
              type="button"
              data-testid="text-overlay-box"
              aria-label={ts.boxLabel}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const frame = frameRef.current?.getBoundingClientRect();
                if (!frame) return;
                grabRef.current = {
                  dx: e.clientX - (frame.left + (centre.x / 100) * frame.width),
                  dy: e.clientY - (frame.top + (centre.y / 100) * frame.height),
                };
              }}
              onPointerMove={(e) => {
                const grab = grabRef.current;
                if (grab) place(e.clientX - grab.dx, e.clientY - grab.dy);
              }}
              onPointerUp={() => {
                grabRef.current = null;
              }}
              onPointerCancel={() => {
                grabRef.current = null;
              }}
              onLostPointerCapture={() => {
                grabRef.current = null;
              }}
              className="absolute flex items-center justify-center text-center cursor-move border border-dashed border-primary bg-primary/10 leading-[1.2] break-words"
              style={{
                left: `${centre.x}%`,
                top: `${centre.y}%`,
                width: `${block.width}%`,
                height: `${block.height}%`,
                transform: "translate(-50%, -50%)",
                color: layout.color,
                fontSize: `${(layout.fontSize / image.width) * renderedWidth}px`,
              }}
            >
              {layout.text}
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
        {ts.dragHint}
      </div>
    </div>
  );
}
