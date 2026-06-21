import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Line, Rect, Transformer } from "react-konva";
import { useEditorStore } from "@/stores/editor-store";
import type { CropState } from "@/types/editor";

// ---------------------------------------------------------------------------
// Aspect ratio presets
// ---------------------------------------------------------------------------

export const ASPECT_RATIOS = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "3:2", value: 3 / 2 },
  { label: "2:3", value: 2 / 3 },
] as const;

// ---------------------------------------------------------------------------
// Hook: useCropTool
// ---------------------------------------------------------------------------

export interface CropToolApi {
  cropRef: React.RefObject<Konva.Rect | null>;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  cropState: CropState | null;
  aspectRatio: string;
  setAspectRatio: (label: string) => void;
  initCrop: () => void;
  applyCrop: () => void;
  cancelCrop: () => void;
  updateCropSize: (w: number, h: number) => void;
  swapDimensions: () => void;
}

export function useCropTool(): CropToolApi {
  const cropRef = useRef<Konva.Rect | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [aspectRatio, setAspectRatioState] = useState("Free");

  const cropState = useEditorStore((s) => s.cropState);
  const setCropState = useEditorStore((s) => s.setCropState);
  const applyCropAction = useEditorStore((s) => s.applyCrop);
  const canvasSize = useEditorStore((s) => s.canvasSize);

  // Attach transformer to crop rect
  useEffect(() => {
    const tr = transformerRef.current;
    const node = cropRef.current;
    if (tr && node && cropState) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
  }, [cropState]);

  const initCrop = useCallback(() => {
    const margin = 0.1;
    setCropState({
      x: canvasSize.width * margin,
      y: canvasSize.height * margin,
      width: canvasSize.width * (1 - 2 * margin),
      height: canvasSize.height * (1 - 2 * margin),
      aspectRatio: null,
    });
  }, [canvasSize, setCropState]);

  const setAspectRatio = useCallback(
    (label: string) => {
      setAspectRatioState(label);
      const preset = ASPECT_RATIOS.find((p) => p.label === label);
      if (!preset?.value || !cropState) return;
      const ratio = preset.value;

      let w = cropState.width;
      let h = w / ratio;
      if (h > canvasSize.height) {
        h = canvasSize.height * 0.8;
        w = h * ratio;
      }

      setCropState({
        ...cropState,
        width: w,
        height: h,
        aspectRatio: label,
      });
    },
    [cropState, canvasSize, setCropState],
  );

  const applyCrop = useCallback(() => {
    applyCropAction();
  }, [applyCropAction]);

  const cancelCrop = useCallback(() => {
    setCropState(null);
  }, [setCropState]);

  const updateCropSize = useCallback(
    (w: number, h: number) => {
      if (!cropState) return;
      setCropState({ ...cropState, width: w, height: h });
    },
    [cropState, setCropState],
  );

  const swapDimensions = useCallback(() => {
    if (!cropState) return;
    setCropState({
      ...cropState,
      width: cropState.height,
      height: cropState.width,
    });
  }, [cropState, setCropState]);

  return {
    cropRef,
    transformerRef,
    cropState,
    aspectRatio,
    setAspectRatio,
    initCrop,
    applyCrop,
    cancelCrop,
    updateCropSize,
    swapDimensions,
  };
}

// ---------------------------------------------------------------------------
// CropOverlay -- renders darkened overlay + crop region + rule-of-thirds
// ---------------------------------------------------------------------------

export function CropOverlay() {
  const cropState = useEditorStore((s) => s.cropState);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const setCropState = useEditorStore((s) => s.setCropState);
  const cropRectRef = useRef<Konva.Rect | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    if (trRef.current && cropRectRef.current && cropState) {
      trRef.current.nodes([cropRectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [cropState]);

  if (!cropState) return null;

  const { x, y, width, height } = cropState;
  const cw = canvasSize.width;
  const ch = canvasSize.height;
  const overlayFill = "rgba(0, 0, 0, 0.5)";

  // Rule-of-thirds grid lines
  const thirdW = width / 3;
  const thirdH = height / 3;

  const handleTransformEnd = () => {
    const node = cropRectRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newW = Math.max(10, node.width() * scaleX);
    const newH = Math.max(10, node.height() * scaleY);
    node.scaleX(1);
    node.scaleY(1);
    setCropState({
      ...cropState,
      x: node.x(),
      y: node.y(),
      width: newW,
      height: newH,
    });
  };

  const handleDragEnd = () => {
    const node = cropRectRef.current;
    if (!node) return;
    setCropState({
      ...cropState,
      x: Math.max(0, Math.min(node.x(), cw - width)),
      y: Math.max(0, Math.min(node.y(), ch - height)),
    });
  };

  return (
    <Group>
      {/* Darkened overlays: top, bottom, left, right */}
      <Rect x={0} y={0} width={cw} height={y} fill={overlayFill} listening={false} />
      <Rect
        x={0}
        y={y + height}
        width={cw}
        height={ch - y - height}
        fill={overlayFill}
        listening={false}
      />
      <Rect x={0} y={y} width={x} height={height} fill={overlayFill} listening={false} />
      <Rect
        x={x + width}
        y={y}
        width={cw - x - width}
        height={height}
        fill={overlayFill}
        listening={false}
      />

      {/* Crop region */}
      <Rect
        ref={cropRectRef}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke="#ffffff"
        strokeWidth={1}
        draggable
        listening
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />

      {/* Rule-of-thirds grid */}
      <Line
        points={[x + thirdW, y, x + thirdW, y + height]}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={0.5}
        listening={false}
      />
      <Line
        points={[x + thirdW * 2, y, x + thirdW * 2, y + height]}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={0.5}
        listening={false}
      />
      <Line
        points={[x, y + thirdH, x + width, y + thirdH]}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={0.5}
        listening={false}
      />
      <Line
        points={[x, y + thirdH * 2, x + width, y + thirdH * 2]}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={0.5}
        listening={false}
      />

      {/* Transformer */}
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        flipEnabled={false}
        keepRatio={false}
        anchorSize={8}
        anchorStroke="#ffffff"
        anchorFill="#E07832"
        anchorCornerRadius={1}
        borderStroke="#ffffff"
        borderStrokeWidth={1}
        enabledAnchors={[
          "top-left",
          "top-center",
          "top-right",
          "middle-left",
          "middle-right",
          "bottom-left",
          "bottom-center",
          "bottom-right",
        ]}
        boundBoxFunc={(_oldBox, newBox) => ({
          ...newBox,
          width: Math.max(10, newBox.width),
          height: Math.max(10, newBox.height),
        })}
      />
    </Group>
  );
}
