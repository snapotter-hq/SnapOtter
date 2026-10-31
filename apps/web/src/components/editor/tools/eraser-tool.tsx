// apps/web/src/components/editor/tools/eraser-tool.tsx

import type Konva from "konva";
import { useCallback, useRef } from "react";
import { generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject, LineAttrs } from "@/types/editor";

interface StrokeState {
  points: number[];
  objectId: string;
}

export function useEraserTool() {
  const strokeRef = useRef<StrokeState | null>(null);

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const { activeTool, brushSize, brushOpacity, brushHardness, eraserMode, zoom, panOffset } =
      useEditorStore.getState();

    if (activeTool !== "eraser") return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = (pointer.x - panOffset.x) / zoom;
    const y = (pointer.y - panOffset.y) / zoom;

    const { selection } = useEditorStore.getState();
    if (selection) {
      const { bounds } = selection;
      if (
        x < bounds.x ||
        x > bounds.x + bounds.width ||
        y < bounds.y ||
        y > bounds.y + bounds.height
      ) {
        return;
      }
    }

    const id = generateId();
    const shadowBlurValue = brushSize * 0.4 * (1 - brushHardness);

    const isBlock = eraserMode === "block";

    const attrs: LineAttrs = {
      points: [x, y],
      stroke: "#000000",
      strokeWidth: brushSize,
      tension: isBlock ? 0 : 0.5,
      lineCap: isBlock ? "butt" : "round",
      lineJoin: isBlock ? "miter" : "round",
      opacity: brushOpacity,
      globalCompositeOperation: "destination-out",
      ...(shadowBlurValue > 0 && {
        shadowBlur: shadowBlurValue,
        shadowColor: "#000000",
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      }),
    };

    const obj: CanvasObject = {
      id,
      type: "line",
      layerId: useEditorStore.getState().activeLayerId,
      attrs,
    };

    useEditorStore.getState().addObject(obj);
    strokeRef.current = { points: [x, y], objectId: id };
  }, []);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!strokeRef.current) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const { zoom, panOffset } = useEditorStore.getState();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = (pointer.x - panOffset.x) / zoom;
    const y = (pointer.y - panOffset.y) / zoom;

    const { selection } = useEditorStore.getState();
    if (selection) {
      const { bounds } = selection;
      if (
        x < bounds.x ||
        x > bounds.x + bounds.width ||
        y < bounds.y ||
        y > bounds.y + bounds.height
      ) {
        return;
      }
    }

    strokeRef.current.points = [...strokeRef.current.points, x, y];

    useEditorStore.getState().updateObject(strokeRef.current.objectId, {
      points: [...strokeRef.current.points],
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (strokeRef.current) {
      // Only update the label -- addObject() in handleMouseDown already
      // incremented _historyVersion and recorded the pre-stroke snapshot.
      // Bumping the version again would create a second history entry whose
      // objects array still contains the line, so the first undo would
      // restore the same objects reference and the canvas would not repaint.
      useEditorStore.setState({ lastAction: { id: "eraserStroke" } });
    }
    strokeRef.current = null;
  }, []);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
