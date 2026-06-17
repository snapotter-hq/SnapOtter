// apps/web/src/components/editor/tools/fill-tool.tsx

import type Konva from "konva";
import { useCallback } from "react";
import { generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject } from "@/types/editor";
import { captureDocumentCanvas } from "../stage-capture";

function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hexToRgb(hex: string): [number, number, number] {
  const num = Number.parseInt(hex.replace("#", ""), 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/**
 * Scanline flood fill algorithm.
 * Fills pixels within tolerance of the target color with the replacement color.
 */
function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  tolerance: number,
  contiguous: boolean,
): void {
  const { width, height, data } = imageData;
  const startIdx = (startY * width + startX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];

  // Already same color, skip
  if (fillR === targetR && fillG === targetG && fillB === targetB) return;

  const maxDist = tolerance * Math.sqrt(3);

  if (!contiguous) {
    // Non-contiguous: fill all pixels matching target color
    for (let i = 0; i < data.length; i += 4) {
      const dist = colorDistance(data[i], data[i + 1], data[i + 2], targetR, targetG, targetB);
      if (dist <= maxDist) {
        data[i] = fillR;
        data[i + 1] = fillG;
        data[i + 2] = fillB;
        data[i + 3] = 255;
      }
    }
    return;
  }

  // Contiguous scanline flood fill
  const visited = new Uint8Array(width * height);

  function matches(idx: number): boolean {
    const pi = idx * 4;
    if (visited[idx]) return false;
    return (
      colorDistance(data[pi], data[pi + 1], data[pi + 2], targetR, targetG, targetB) <= maxDist
    );
  }

  function fillPixel(idx: number): void {
    const pi = idx * 4;
    data[pi] = fillR;
    data[pi + 1] = fillG;
    data[pi + 2] = fillB;
    data[pi + 3] = 255;
    visited[idx] = 1;
  }

  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const [sx, sy] = entry;
    let x = sx;

    // Move left to find the start of the line
    while (x > 0 && matches(sy * width + (x - 1))) {
      x--;
    }

    let spanAbove = false;
    let spanBelow = false;

    while (x < width && matches(sy * width + x)) {
      fillPixel(sy * width + x);

      // Check above
      if (sy > 0) {
        const aboveIdx = (sy - 1) * width + x;
        if (matches(aboveIdx)) {
          if (!spanAbove) {
            stack.push([x, sy - 1]);
            spanAbove = true;
          }
        } else {
          spanAbove = false;
        }
      }

      // Check below
      if (sy < height - 1) {
        const belowIdx = (sy + 1) * width + x;
        if (matches(belowIdx)) {
          if (!spanBelow) {
            stack.push([x, sy + 1]);
            spanBelow = true;
          }
        } else {
          spanBelow = false;
        }
      }

      x++;
    }
  }
}

export function useFillTool(stageRef: React.RefObject<Konva.Stage | null>) {
  const handleMouseDown = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      const {
        activeTool,
        foregroundColor,
        fillTolerance,
        fillContiguous,
        canvasSize,
        zoom,
        panOffset,
      } = useEditorStore.getState();

      if (activeTool !== "fill") return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const x = Math.floor((pointer.x - panOffset.x) / zoom);
      const y = Math.floor((pointer.y - panOffset.y) / zoom);

      if (x < 0 || x >= canvasSize.width || y < 0 || y >= canvasSize.height) return;

      // Capture the document pixels at document resolution (ignoring zoom/pan).
      const stageCanvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);

      const ctx = stageCanvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
      const [fillR, fillG, fillB] = hexToRgb(foregroundColor);

      floodFill(imageData, x, y, fillR, fillG, fillB, fillTolerance, fillContiguous);

      // Put the modified data back and create an image object
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = stageCanvas.toDataURL();

      const obj: CanvasObject = {
        id: generateId(),
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
    },
    [stageRef],
  );

  const handleMouseMove = useCallback((_e: Konva.KonvaEventObject<MouseEvent>) => {
    // No-op: fill is a single-click operation
  }, []);

  const handleMouseUp = useCallback(() => {
    // No-op
  }, []);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
