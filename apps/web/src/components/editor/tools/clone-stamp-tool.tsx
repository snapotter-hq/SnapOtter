// apps/web/src/components/editor/tools/clone-stamp-tool.tsx

import type Konva from "konva";
import { useCallback, useRef } from "react";
import { generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject } from "@/types/editor";
import { captureDocumentCanvas } from "../stage-capture";

interface StampState {
  objectId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sourceSnapshot: ImageData;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

export function useCloneStampTool(stageRef: React.RefObject<Konva.Stage | null>) {
  const stampRef = useRef<StampState | null>(null);
  const initialOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const setCloneSource = useEditorStore((s) => s.setCloneSource);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const {
        activeTool,
        cloneSource,
        cloneAligned,
        brushSize,
        brushOpacity,
        canvasSize,
        zoom,
        panOffset,
      } = useEditorStore.getState();

      if (activeTool !== "clone-stamp") return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const x = Math.floor((pointer.x - panOffset.x) / zoom);
      const y = Math.floor((pointer.y - panOffset.y) / zoom);

      // Alt+click sets the clone source
      if (e.evt.altKey) {
        setCloneSource({ x, y, aligned: cloneAligned });
        initialOffsetRef.current = null;
        return;
      }

      if (!cloneSource) return;

      // Capture a snapshot of the document pixels at document resolution.
      const stageCanvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);

      const stageCtx = stageCanvas.getContext("2d");
      if (!stageCtx) return;

      const sourceSnapshot = stageCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);

      // Create an offscreen canvas for the clone output
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Compute offset from source to destination
      let offsetX: number;
      let offsetY: number;

      if (cloneAligned && initialOffsetRef.current) {
        offsetX = initialOffsetRef.current.x;
        offsetY = initialOffsetRef.current.y;
      } else {
        offsetX = cloneSource.x - x;
        offsetY = cloneSource.y - y;
        if (cloneAligned) {
          initialOffsetRef.current = { x: offsetX, y: offsetY };
        }
      }

      // Paint the first dab
      paintDab(ctx, sourceSnapshot, x, y, offsetX, offsetY, brushSize, brushOpacity, canvasSize);

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
      stampRef.current = {
        objectId: id,
        canvas,
        ctx,
        sourceSnapshot,
        startX: x,
        startY: y,
        offsetX,
        offsetY,
      };
    },
    [stageRef, setCloneSource],
  );

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!stampRef.current) return;

    const { brushSize, brushOpacity, canvasSize, zoom, panOffset } = useEditorStore.getState();

    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = Math.floor((pointer.x - panOffset.x) / zoom);
    const y = Math.floor((pointer.y - panOffset.y) / zoom);

    const { ctx, sourceSnapshot, offsetX, offsetY, canvas, objectId } = stampRef.current;

    paintDab(ctx, sourceSnapshot, x, y, offsetX, offsetY, brushSize, brushOpacity, canvasSize);

    // Use canvas element directly as image source during the stroke instead of
    // converting to a data URL on every mouse move (major perf fix).
    // The "image" property is a runtime-only hint for the renderer; cast to bypass strict attrs type.
    useEditorStore
      .getState()
      .updateObject(objectId, { image: canvas } as unknown as Record<string, unknown>);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (stampRef.current) {
      const { canvas, objectId } = stampRef.current;
      const dataUrl = canvas.toDataURL();
      useEditorStore
        .getState()
        .updateObject(objectId, { src: dataUrl, image: undefined } as unknown as Record<
          string,
          unknown
        >);
    }
    stampRef.current = null;
  }, []);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}

function paintDab(
  ctx: CanvasRenderingContext2D,
  source: ImageData,
  destX: number,
  destY: number,
  offsetX: number,
  offsetY: number,
  brushSize: number,
  opacity: number,
  canvasSize: { width: number; height: number },
): void {
  const halfSize = Math.floor(brushSize / 2);
  const srcX = destX + offsetX;
  const srcY = destY + offsetY;

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      // Circle mask
      if (dx * dx + dy * dy > halfSize * halfSize) continue;

      const px = destX + dx;
      const py = destY + dy;
      const sx = srcX + dx;
      const sy = srcY + dy;

      if (
        px < 0 ||
        px >= canvasSize.width ||
        py < 0 ||
        py >= canvasSize.height ||
        sx < 0 ||
        sx >= canvasSize.width ||
        sy < 0 ||
        sy >= canvasSize.height
      ) {
        continue;
      }

      const si = (sy * canvasSize.width + sx) * 4;
      const r = source.data[si];
      const g = source.data[si + 1];
      const b = source.data[si + 2];
      const a = source.data[si + 3];

      ctx.globalAlpha = (a / 255) * opacity;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px, py, 1, 1);
    }
  }

  ctx.globalAlpha = 1;
}
