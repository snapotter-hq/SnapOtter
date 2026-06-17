// apps/web/src/components/editor/tools/eyedropper-tool.tsx

import type Konva from "konva";
import { useCallback, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import type { SampleSize } from "../options/eyedropper-options";
import { captureDocumentCanvas } from "../stage-capture";

/**
 * Sample a single pixel or averaged region from a canvas context at (x, y).
 * Returns hex color string.
 */
function samplePixelColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sampleSize: SampleSize,
): string {
  const half = Math.floor(sampleSize / 2);
  const startX = x - half;
  const startY = y - half;

  const imageData = ctx.getImageData(startX, startY, sampleSize, sampleSize);
  const data = imageData.data;
  const pixelCount = sampleSize * sampleSize;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (let i = 0; i < pixelCount; i++) {
    rSum += data[i * 4];
    gSum += data[i * 4 + 1];
    bSum += data[i * 4 + 2];
  }

  const r = Math.round(rSum / pixelCount);
  const g = Math.round(gSum / pixelCount);
  const b = Math.round(bSum / pixelCount);

  return rgbToHex(r, g, b);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

interface UseEyedropperToolOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  sampleSize: SampleSize;
}

export function useEyedropperTool({
  stageRef,
  sampleSize: _sampleSizeProp,
}: UseEyedropperToolOptions) {
  const setForegroundColor = useEditorStore((s) => s.setForegroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  // Use the sampleSize prop directly (caller wires it from options state)
  const sampleSize: SampleSize = _sampleSizeProp;
  const [sampledColor, setSampledColor] = useState<string | null>(null);
  const canvasCache = useRef<HTMLCanvasElement | null>(null);

  /**
   * Export the document to a flat canvas at document resolution for pixel
   * sampling, ignoring the current zoom/pan transform.
   * Cached so repeated clicks during one drag don't re-export.
   */
  const getStageCanvas = useCallback((): HTMLCanvasElement | null => {
    const stage = stageRef.current;
    if (!stage) return null;

    const canvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);
    canvasCache.current = canvas;
    return canvas;
  }, [stageRef, canvasSize]);

  /**
   * Invalidate the cache (call on mousedown so we get fresh data).
   */
  const invalidateCache = useCallback(() => {
    canvasCache.current = null;
  }, []);

  /**
   * Sample color at stage pointer position.
   * Returns the sampled hex color, or null if sampling failed.
   */
  const sampleAtPointer = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>): string | null => {
      const stage = e.target.getStage();
      if (!stage) return null;

      const pointer = stage.getPointerPosition();
      if (!pointer) return null;

      const canvas = canvasCache.current ?? getStageCanvas();
      if (!canvas) return null;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Transform pointer coordinates from screen space to canvas space
      const x = Math.round((pointer.x - panOffset.x) / zoom);
      const y = Math.round((pointer.y - panOffset.y) / zoom);

      // Bounds check against the actual canvas dimensions (unzoomed)
      if (x < 0 || y < 0 || x >= canvasSize.width || y >= canvasSize.height) {
        return null;
      }

      const color = samplePixelColor(ctx, x, y, sampleSize);
      setSampledColor(color);
      return color;
    },
    [getStageCanvas, sampleSize, zoom, panOffset, canvasSize],
  );

  /**
   * Handle click/mousedown on the canvas for eyedropper sampling.
   * Alt+click sets background color; normal click sets foreground.
   */
  const handleEyedropperClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      invalidateCache();

      const color = sampleAtPointer(e);
      if (!color) return;

      if (e.evt.altKey) {
        setBackgroundColor(color);
      } else {
        setForegroundColor(color);
      }
    },
    [invalidateCache, sampleAtPointer, setForegroundColor, setBackgroundColor],
  );

  /**
   * Handle mousemove while eyedropper is active (for live preview).
   */
  const handleEyedropperMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      sampleAtPointer(e);
    },
    [sampleAtPointer],
  );

  return {
    handleEyedropperClick,
    handleEyedropperMove,
    sampledColor,
    invalidateCache,
  };
}
