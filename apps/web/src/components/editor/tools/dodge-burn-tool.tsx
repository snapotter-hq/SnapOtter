// apps/web/src/components/editor/tools/dodge-burn-tool.tsx

import type Konva from "konva";
import { useCallback, useRef } from "react";
import { generateId } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject, ToolType } from "@/types/editor";
import { captureDocumentCanvas } from "../stage-capture";

const DODGE_BURN_TOOLS = new Set<ToolType>(["dodge", "burn", "sponge"]);

interface StrokeState {
  objectId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sourceSnapshot: ImageData;
}

function getRangeFactor(
  r: number,
  g: number,
  b: number,
  range: "shadows" | "midtones" | "highlights",
): number {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (range) {
    case "shadows":
      return luminance < 85 ? 1 : luminance < 128 ? (128 - luminance) / 43 : 0;
    case "highlights":
      return luminance > 170 ? 1 : luminance > 128 ? (luminance - 128) / 42 : 0;
    default:
      if (luminance < 64) return luminance / 64;
      if (luminance > 192) return (255 - luminance) / 63;
      return 1;
  }
}

function rgbToHsl(rIn: number, gIn: number, bIn: number): [number, number, number] {
  const r = rIn / 255;
  const g = gIn / 255;
  const b = bIn / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useDodgeBurnTool(stageRef: React.RefObject<Konva.Stage | null>) {
  const strokeRef = useRef<StrokeState | null>(null);

  const handleMouseDown = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      const { activeTool, canvasSize, zoom, panOffset } = useEditorStore.getState();

      if (!DODGE_BURN_TOOLS.has(activeTool)) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const x = Math.floor((pointer.x - panOffset.x) / zoom);
      const y = Math.floor((pointer.y - panOffset.y) / zoom);
      if (x < 0 || x >= canvasSize.width || y < 0 || y >= canvasSize.height) return;

      // Snapshot the document pixels at document resolution.
      const stageCanvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);

      const stageCtx = stageCanvas.getContext("2d");
      if (!stageCtx) return;

      const sourceSnapshot = stageCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);

      // Create output canvas
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.putImageData(sourceSnapshot, 0, 0);

      applyBrushDab(ctx, sourceSnapshot, x, y, canvasSize);

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
      strokeRef.current = { objectId: id, canvas, ctx, sourceSnapshot };
    },
    [stageRef],
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

    const { ctx, sourceSnapshot, canvas, objectId } = strokeRef.current;

    applyBrushDab(ctx, sourceSnapshot, x, y, canvasSize);

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

function applyBrushDab(
  ctx: CanvasRenderingContext2D,
  _source: ImageData,
  centerX: number,
  centerY: number,
  canvasSize: { width: number; height: number },
): void {
  const { activeTool, brushSize, dodgeBurnExposure, dodgeBurnRange, spongeMode, spongeFlow } =
    useEditorStore.getState();

  const halfSize = Math.floor(brushSize / 2);
  const exposure = dodgeBurnExposure / 100;
  const flow = spongeFlow / 100;

  const imageData = ctx.getImageData(
    Math.max(0, centerX - halfSize),
    Math.max(0, centerY - halfSize),
    Math.min(canvasSize.width, centerX + halfSize + 1) - Math.max(0, centerX - halfSize),
    Math.min(canvasSize.height, centerY + halfSize + 1) - Math.max(0, centerY - halfSize),
  );

  const startPx = Math.max(0, centerX - halfSize);
  const startPy = Math.max(0, centerY - halfSize);

  for (let py = 0; py < imageData.height; py++) {
    for (let px = 0; px < imageData.width; px++) {
      const dx = startPx + px - centerX;
      const dy = startPy + py - centerY;

      if (dx * dx + dy * dy > halfSize * halfSize) continue;

      const idx = (py * imageData.width + px) * 4;
      let r = imageData.data[idx];
      let g = imageData.data[idx + 1];
      let b = imageData.data[idx + 2];

      if (activeTool === "dodge") {
        const factor = getRangeFactor(r, g, b, dodgeBurnRange);
        const multiplier = 1 + exposure * factor;
        r = clamp(Math.round(r * multiplier), 0, 255);
        g = clamp(Math.round(g * multiplier), 0, 255);
        b = clamp(Math.round(b * multiplier), 0, 255);
      } else if (activeTool === "burn") {
        const factor = getRangeFactor(r, g, b, dodgeBurnRange);
        const multiplier = 1 - exposure * factor;
        r = clamp(Math.round(r * multiplier), 0, 255);
        g = clamp(Math.round(g * multiplier), 0, 255);
        b = clamp(Math.round(b * multiplier), 0, 255);
      } else if (activeTool === "sponge") {
        const [h, s, l] = rgbToHsl(r, g, b);
        let newS: number;
        if (spongeMode === "saturate") {
          newS = Math.min(1, s + flow * 0.1);
        } else {
          newS = Math.max(0, s - flow * 0.1);
        }
        const [nr, ng, nb] = hslToRgb(h, newS, l);
        r = nr;
        g = ng;
        b = nb;
      }

      imageData.data[idx] = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
    }
  }

  ctx.putImageData(imageData, startPx, startPy);
}
