// apps/web/src/components/editor/tools/pixel-brush-tool.tsx

import type Konva from "konva";
import { useCallback, useRef } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject, ToolType } from "@/types/editor";
import { captureDocumentContext, reportCaptureFailure } from "../stage-capture";

const PIXEL_BRUSH_TOOLS = new Set<ToolType>(["blur-brush", "sharpen-brush", "smudge"]);

interface StrokeState {
  objectId: string;
  canvas: HTMLCanvasElement;
  strokeCtx: CanvasRenderingContext2D;
  workingCtx: CanvasRenderingContext2D;
  sourceSnapshot: ImageData;
  lastX: number;
  lastY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function usePixelBrushTool(stageRef: React.RefObject<Konva.Stage | null>) {
  const strokeRef = useRef<StrokeState | null>(null);
  const captureMessages = useTranslation().t.editor.ui.captureFailure;

  const handleMouseDown = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      const { activeTool, canvasSize, zoom, panOffset } = useEditorStore.getState();

      if (!PIXEL_BRUSH_TOOLS.has(activeTool)) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const x = Math.floor((pointer.x - panOffset.x) / zoom);
      const y = Math.floor((pointer.y - panOffset.y) / zoom);
      if (x < 0 || x >= canvasSize.width || y < 0 || y >= canvasSize.height) return;

      // Snapshot the document pixels at document resolution. The capture doubles as
      // the working buffer: the brush reads from it and writes each pass back into it.
      const capture = captureDocumentContext(stage, canvasSize.width, canvasSize.height);
      if (!capture.ok) {
        reportCaptureFailure(capture.reason, captureMessages);
        return;
      }
      const workingCtx = capture.ctx;

      const sourceSnapshot = workingCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);

      // The stroke object starts fully transparent and only ever receives the pixels
      // the brush touches. Seeding it with the whole snapshot stacked an opaque copy
      // of the entire document on top of the image (#829).
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      const strokeCtx = canvas.getContext("2d", { willReadFrequently: true });
      if (!strokeCtx) {
        reportCaptureFailure("no-context", captureMessages);
        return;
      }

      applyPixelBrush(workingCtx, strokeCtx, sourceSnapshot, x, y, canvasSize);

      const id = generateId();
      const dataUrl = canvas.toDataURL();

      const obj: CanvasObject = {
        id,
        type: "image",
        layerId: useEditorStore.getState().activeLayerId,
        attrs: {
          x: 0,
          y: 0,
          width: canvasSize.width,
          height: canvasSize.height,
          rotation: 0,
          opacity: 1,
          src: dataUrl,
        },
      };

      useEditorStore.getState().addObject(obj);
      strokeRef.current = {
        objectId: id,
        canvas,
        strokeCtx,
        workingCtx,
        sourceSnapshot,
        lastX: x,
        lastY: y,
      };
    },
    [stageRef, captureMessages],
  );

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!strokeRef.current) return;

    const { canvasSize, zoom, panOffset } = useEditorStore.getState();

    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = Math.floor((pointer.x - panOffset.x) / zoom);
    const y = Math.floor((pointer.y - panOffset.y) / zoom);

    const { strokeCtx, workingCtx, sourceSnapshot, canvas, objectId } = strokeRef.current;

    applyPixelBrush(workingCtx, strokeCtx, sourceSnapshot, x, y, canvasSize);

    // Update source snapshot for smudge continuity
    const updatedData = workingCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);
    strokeRef.current.sourceSnapshot = updatedData;
    strokeRef.current.lastX = x;
    strokeRef.current.lastY = y;

    // Use canvas element directly as image source during the stroke instead of
    // converting to a data URL on every mouse move (major perf fix).
    useEditorStore
      .getState()
      .updateObject(objectId, { image: canvas } as unknown as Record<string, unknown>);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (strokeRef.current) {
      const { canvas, objectId } = strokeRef.current;
      const dataUrl = canvas.toDataURL();
      useEditorStore
        .getState()
        .updateObject(objectId, { src: dataUrl, image: undefined } as unknown as Record<
          string,
          unknown
        >);
    }
    strokeRef.current = null;
  }, []);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}

function applyPixelBrush(
  workingCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  source: ImageData,
  centerX: number,
  centerY: number,
  canvasSize: { width: number; height: number },
): void {
  const { activeTool, brushSize, pixelBrushStrength } = useEditorStore.getState();
  const strength = pixelBrushStrength / 100;
  const halfSize = Math.floor(brushSize / 2);

  const left = Math.max(0, centerX - halfSize);
  const top = Math.max(0, centerY - halfSize);
  const right = Math.min(canvasSize.width, centerX + halfSize + 1);
  const bottom = Math.min(canvasSize.height, centerY + halfSize + 1);
  const w = right - left;
  const h = bottom - top;

  if (w <= 0 || h <= 0) return;

  const imageData = workingCtx.getImageData(left, top, w, h);

  if (activeTool === "blur-brush") {
    applyBoxBlur(
      imageData,
      source,
      left,
      top,
      centerX,
      centerY,
      canvasSize.width,
      halfSize,
      strength,
    );
  } else if (activeTool === "sharpen-brush") {
    applySharpen(
      imageData,
      source,
      left,
      top,
      centerX,
      centerY,
      canvasSize.width,
      halfSize,
      strength,
    );
  } else if (activeTool === "smudge") {
    applySmudge(
      imageData,
      source,
      left,
      top,
      centerX,
      centerY,
      canvasSize.width,
      halfSize,
      strength,
    );
  }

  workingCtx.putImageData(imageData, left, top);
  copyBrushCircle(imageData, strokeCtx, left, top, centerX, centerY, halfSize);
}

// Lift the brushed circle out of the working buffer onto the stroke canvas. Every
// other pixel of the stroke keeps whatever it had: transparent unless an earlier
// pass of the same stroke already touched it.
function copyBrushCircle(
  region: ImageData,
  strokeCtx: CanvasRenderingContext2D,
  left: number,
  top: number,
  centerX: number,
  centerY: number,
  halfSize: number,
): void {
  const patch = strokeCtx.getImageData(left, top, region.width, region.height);
  for (let py = 0; py < region.height; py++) {
    for (let px = 0; px < region.width; px++) {
      const dx = left + px - centerX;
      const dy = top + py - centerY;
      if (dx * dx + dy * dy > halfSize * halfSize) continue;
      const idx = (py * region.width + px) * 4;
      patch.data[idx] = region.data[idx];
      patch.data[idx + 1] = region.data[idx + 1];
      patch.data[idx + 2] = region.data[idx + 2];
      patch.data[idx + 3] = region.data[idx + 3];
    }
  }
  strokeCtx.putImageData(patch, left, top);
}

function applyBoxBlur(
  imageData: ImageData,
  source: ImageData,
  startX: number,
  startY: number,
  centerX: number,
  centerY: number,
  sourceWidth: number,
  halfSize: number,
  strength: number,
): void {
  const kernelSize = Math.max(1, Math.round(strength * 3));

  for (let py = 0; py < imageData.height; py++) {
    for (let px = 0; px < imageData.width; px++) {
      // Same brush mask as sharpen and smudge (and as copyBrushCircle): centred on
      // the click, not on the clipped region.
      const dx = startX + px - centerX;
      const dy = startY + py - centerY;
      if (dx * dx + dy * dy > halfSize * halfSize) continue;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let ky = -kernelSize; ky <= kernelSize; ky++) {
        for (let kx = -kernelSize; kx <= kernelSize; kx++) {
          const sx = startX + px + kx;
          const sy = startY + py + ky;
          if (sx < 0 || sx >= sourceWidth || sy < 0 || sy >= source.height) {
            continue;
          }
          const si = (sy * sourceWidth + sx) * 4;
          sumR += source.data[si];
          sumG += source.data[si + 1];
          sumB += source.data[si + 2];
          count++;
        }
      }

      if (count > 0) {
        const idx = (py * imageData.width + px) * 4;
        imageData.data[idx] = Math.round(sumR / count);
        imageData.data[idx + 1] = Math.round(sumG / count);
        imageData.data[idx + 2] = Math.round(sumB / count);
      }
    }
  }
}

function applySharpen(
  imageData: ImageData,
  source: ImageData,
  startX: number,
  startY: number,
  centerX: number,
  centerY: number,
  sourceWidth: number,
  halfSize: number,
  strength: number,
): void {
  const factor = 1 + strength * 4;

  for (let py = 0; py < imageData.height; py++) {
    for (let px = 0; px < imageData.width; px++) {
      const dxC = startX + px - centerX;
      const dyC = startY + py - centerY;
      if (dxC * dxC + dyC * dyC > halfSize * halfSize) continue;

      const sx = startX + px;
      const sy = startY + py;
      const ci = (sy * sourceWidth + sx) * 4;

      // Simple unsharp: pixel + factor * (pixel - average of neighbors)
      let avgR = 0;
      let avgG = 0;
      let avgB = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (kx === 0 && ky === 0) continue;
          const nx = sx + kx;
          const ny = sy + ky;
          if (nx >= 0 && nx < sourceWidth && ny >= 0) {
            const ni = (ny * sourceWidth + nx) * 4;
            if (ni >= 0 && ni < source.data.length) {
              avgR += source.data[ni];
              avgG += source.data[ni + 1];
              avgB += source.data[ni + 2];
              count++;
            }
          }
        }
      }

      if (count > 0) {
        avgR /= count;
        avgG /= count;
        avgB /= count;
      }

      const idx = (py * imageData.width + px) * 4;
      imageData.data[idx] = clamp(
        Math.round(source.data[ci] + factor * (source.data[ci] - avgR)),
        0,
        255,
      );
      imageData.data[idx + 1] = clamp(
        Math.round(source.data[ci + 1] + factor * (source.data[ci + 1] - avgG)),
        0,
        255,
      );
      imageData.data[idx + 2] = clamp(
        Math.round(source.data[ci + 2] + factor * (source.data[ci + 2] - avgB)),
        0,
        255,
      );
    }
  }
}

function applySmudge(
  imageData: ImageData,
  source: ImageData,
  startX: number,
  startY: number,
  centerX: number,
  centerY: number,
  sourceWidth: number,
  halfSize: number,
  strength: number,
): void {
  // Smudge: blend current pixel with its neighbor in the direction of movement
  for (let py = 0; py < imageData.height; py++) {
    for (let px = 0; px < imageData.width; px++) {
      const dxC = startX + px - centerX;
      const dyC = startY + py - centerY;
      if (dxC * dxC + dyC * dyC > halfSize * halfSize) continue;

      const sx = startX + px;
      const sy = startY + py;
      const ci = (sy * sourceWidth + sx) * 4;

      // Blend with the pixel at previous position
      const prevX = sx - Math.sign(dxC || 1);
      const prevY = sy - Math.sign(dyC || 1);
      if (prevX >= 0 && prevX < sourceWidth && prevY >= 0) {
        const pi = (prevY * sourceWidth + prevX) * 4;
        if (pi >= 0 && pi + 2 < source.data.length) {
          const idx = (py * imageData.width + px) * 4;
          imageData.data[idx] = Math.round(
            source.data[ci] * (1 - strength) + source.data[pi] * strength,
          );
          imageData.data[idx + 1] = Math.round(
            source.data[ci + 1] * (1 - strength) + source.data[pi + 1] * strength,
          );
          imageData.data[idx + 2] = Math.round(
            source.data[ci + 2] * (1 - strength) + source.data[pi + 2] * strength,
          );
        }
      }
    }
  }
}
