// apps/web/src/components/editor/editor-canvas.tsx

import type Konva from "konva";
import KonvaFilters from "konva";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  RegularPolygon,
  Shape,
  Stage,
  Star,
  Text,
} from "react-konva";
import useImage from "use-image";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { useEditorStore } from "@/stores/editor-store";
import type {
  AdjustmentValues,
  CanvasObject,
  FilterConfig,
  ImageAttrs,
  ObjectEffects,
} from "@/types/editor";
import {
  type CurvesState,
  composeChannelLuts,
  hasCurvesAdjustments,
  hasLevelsAdjustments,
  type LevelsState,
} from "./adjustment-lut";
import { ContextMenu, useContextMenu } from "./common/context-menu";
import { BrushCursorOverlay, useEditorCursor } from "./common/custom-cursor";
import { LoadingOverlay } from "./common/loading-overlay";
import { SmartGuidesOverlay } from "./common/smart-guides";
import {
  createChannelLutFilter,
  createExposureFilter,
  createGrainFilter,
  createMotionBlurFilter,
  createRadialBlurFilter,
  createSharpenFilter,
  createSurfaceBlurFilter,
  createVibranceFilter,
  createVignetteFilter,
  createWarmthFilter,
} from "./konva-filters";
import { useBrushTool } from "./tools/brush-tool";
import { useCloneStampTool } from "./tools/clone-stamp-tool";
import { CropOverlay } from "./tools/crop-tool";
import { useDodgeBurnTool } from "./tools/dodge-burn-tool";
import { useEraserTool } from "./tools/eraser-tool";
import { useEyedropperTool } from "./tools/eyedropper-tool";
import { useFillTool } from "./tools/fill-tool";
import { useGradientTool } from "./tools/gradient-tool";
import { MoveToolTransformer, useMoveTool } from "./tools/move-tool";

import { usePixelBrushTool } from "./tools/pixel-brush-tool";
import { ActiveSelectionPreview, SelectionOverlay, useSelectionTool } from "./tools/selection-tool";
import { useShapeTool } from "./tools/shape-tool";
import { useTextTool } from "./tools/text-tool";
import { TransformToolTransformer, useTransformTool } from "./tools/transform-tool";

// Konva's globalCompositeOperationType is not exported, so we define a compatible alias
type GlobalCompositeOperation =
  | ""
  | "source-over"
  | "source-in"
  | "source-out"
  | "source-atop"
  | "destination-over"
  | "destination-in"
  | "destination-out"
  | "destination-atop"
  | "lighter"
  | "copy"
  | "xor"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

// Module-level stage ref for export dialog access (Issue #6)
export const editorStageRefHolder: { current: Konva.Stage | null } = {
  current: null,
};

const CHECKERBOARD_SIZE = 20;
const CHECKERBOARD_CSS = `
  repeating-conic-gradient(
    rgba(128, 128, 128, 0.15) 0% 25%,
    transparent 0% 50%
  )
`;

// ---------------------------------------------------------------------------
// Source Image Component (Issue #14)
// ---------------------------------------------------------------------------

function SourceImage({
  url,
  adjustments,
  filters,
  levels,
  curves,
  canvasWidth,
  canvasHeight,
}: {
  url: string;
  adjustments: AdjustmentValues;
  filters: FilterConfig[];
  levels: LevelsState;
  curves: CurvesState;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const [image] = useImage(url);
  const imageRef = useRef<Konva.Image>(null);

  // Issue #12: Apply adjustments/filters to the source image node
  const hasActiveAdjustments = Object.values(adjustments).some((v) => v !== 0);
  const hasActiveFilters = filters.some((f) => f.enabled);
  const hasToneAdjustments = hasLevelsAdjustments(levels) || hasCurvesAdjustments(curves);

  // canvasWidth/canvasHeight are intentional deps: when the canvas is resized the node's
  // cached filter output must be recomputed to match the new draw size, even though the
  // effect body reaches those values through JSX rather than referencing them directly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see note above
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;

    if (hasActiveAdjustments || hasActiveFilters || hasToneAdjustments) {
      const konvaFilters: Array<((this: Konva.Node, imageData: ImageData) => void) | string> = [];

      // Built-in Konva adjustment filters
      if (adjustments.brightness !== 0) {
        konvaFilters.push(KonvaFilters.Filters.Brighten);
        node.brightness(adjustments.brightness / 100);
      }
      if (adjustments.contrast !== 0) {
        konvaFilters.push(KonvaFilters.Filters.Contrast);
        node.contrast(adjustments.contrast);
      }
      if (adjustments.hue !== 0 || adjustments.saturation !== 0 || adjustments.luminance !== 0) {
        konvaFilters.push(KonvaFilters.Filters.HSL);
        node.hue(adjustments.hue);
        node.saturation(adjustments.saturation / 100);
        node.luminance(adjustments.luminance / 100);
      }

      // FIX 3: Custom adjustment filters for exposure, vibrance, warmth
      if (adjustments.exposure !== 0) {
        konvaFilters.push(createExposureFilter(adjustments.exposure / 100));
      }
      if (adjustments.vibrance !== 0) {
        konvaFilters.push(createVibranceFilter(adjustments.vibrance));
      }
      if (adjustments.warmth !== 0) {
        konvaFilters.push(createWarmthFilter(adjustments.warmth));
      }

      // Apply enabled filters
      for (const f of filters) {
        if (!f.enabled) continue;
        switch (f.type) {
          case "blur":
            konvaFilters.push(KonvaFilters.Filters.Blur);
            node.blurRadius(f.params.radius ?? 0);
            break;
          case "grayscale":
            konvaFilters.push(KonvaFilters.Filters.Grayscale);
            break;
          case "sepia":
            konvaFilters.push(KonvaFilters.Filters.Sepia);
            break;
          case "invert":
            konvaFilters.push(KonvaFilters.Filters.Invert);
            break;
          case "pixelate":
            konvaFilters.push(KonvaFilters.Filters.Pixelate);
            node.pixelSize(f.params.size ?? 1);
            break;
          case "emboss":
            konvaFilters.push(KonvaFilters.Filters.Emboss);
            node.embossStrength(f.params.strength ?? 0);
            node.embossWhiteLevel(0.5);
            node.embossBlend(true);
            break;
          case "posterize": {
            konvaFilters.push(KonvaFilters.Filters.Posterize);
            // Konva's Posterize expects `levels` as a 0..1 fraction and derives the
            // actual count via round(levels * 254) + 1. The panel exposes a raw count
            // (2..30), so map it back to the fraction that yields that many levels.
            const posterizeCount = f.params.levels ?? 8;
            node.levels(Math.max(0, (posterizeCount - 1) / 254));
            break;
          }
          case "noise":
            konvaFilters.push(KonvaFilters.Filters.Noise);
            node.noise(f.params.amount ?? 0);
            break;
          case "solarize":
            konvaFilters.push(KonvaFilters.Filters.Solarize);
            break;
          case "threshold":
            konvaFilters.push(KonvaFilters.Filters.Threshold);
            // Konva's Threshold multiplies by 255 internally, so pass the 0..1 level
            // directly. Passing level*255 double-scales it and clears every channel
            // (including alpha), turning the whole image transparent.
            node.threshold(f.params.level ?? 0.5);
            break;
          case "kaleidoscope":
            konvaFilters.push(KonvaFilters.Filters.Kaleidoscope);
            node.kaleidoscopePower(f.params.power ?? 2);
            node.kaleidoscopeAngle(f.params.angle ?? 0);
            break;
          // FIX 2: Custom filter types
          case "motionBlur":
            konvaFilters.push(
              createMotionBlurFilter({
                angle: f.params.angle ?? 0,
                distance: f.params.distance ?? 10,
              }),
            );
            break;
          case "radialBlur":
            konvaFilters.push(
              createRadialBlurFilter({
                amount: f.params.amount ?? 10,
                centerX: f.params.centerX ?? 0.5,
                centerY: f.params.centerY ?? 0.5,
              }),
            );
            break;
          case "surfaceBlur":
            konvaFilters.push(
              createSurfaceBlurFilter({
                radius: f.params.radius ?? 5,
                threshold: f.params.threshold ?? 25,
              }),
            );
            break;
          case "vignette":
            konvaFilters.push(
              createVignetteFilter({
                amount: f.params.amount ?? 50,
                midpoint: f.params.midpoint ?? 50,
              }),
            );
            break;
          case "grain":
            konvaFilters.push(
              createGrainFilter({
                amount: f.params.amount ?? 25,
                size: f.params.size ?? 25,
              }),
            );
            break;
          case "sharpen":
            konvaFilters.push(
              createSharpenFilter({
                amount: f.params.amount ?? 0,
                radius: f.params.radius ?? 1,
              }),
            );
            break;
        }
      }

      // Levels + Curves: apply as a single per-channel LUT filter.
      if (hasToneAdjustments) {
        konvaFilters.push(createChannelLutFilter(composeChannelLuts(levels, curves)));
      }

      // FIX 1: Filters must be set BEFORE caching in Konva
      node.clearCache();
      node.filters(konvaFilters);
      node.cache();
      node.getLayer()?.batchDraw();
    } else {
      node.clearCache();
      node.filters([]);
      node.getLayer()?.batchDraw();
    }
  }, [
    image,
    adjustments,
    filters,
    levels,
    curves,
    hasActiveAdjustments,
    hasActiveFilters,
    hasToneAdjustments,
    canvasWidth,
    canvasHeight,
  ]);

  if (!image) return null;

  // Draw the source at the canvas dimensions so an Image Size resize actually
  // scales the raster instead of leaving it at natural resolution (which would
  // overflow or crop the canvas). Rotate/flip rebake the bitmap so its natural
  // dimensions already match the canvas, keeping this a 1:1 draw for them.
  return (
    <KonvaImage
      ref={imageRef}
      image={image}
      x={0}
      y={0}
      width={canvasWidth}
      height={canvasHeight}
      listening={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Image Object Component (Issue #4)
// ---------------------------------------------------------------------------

function ImageObject({
  obj,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  draggable,
}: {
  obj: CanvasObject & { type: "image" };
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
  draggable: boolean;
}) {
  const a = obj.attrs as ImageAttrs;
  const [image] = useImage(a.src);
  if (!image) return null;

  return (
    <KonvaImage
      id={obj.id}
      image={image}
      x={a.x}
      y={a.y}
      width={a.width}
      height={a.height}
      scaleX={a.scaleX ?? 1}
      scaleY={a.scaleY ?? 1}
      rotation={a.rotation}
      opacity={a.opacity}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
}

// ---------------------------------------------------------------------------
// Object Effects helpers (FIX 5)
// ---------------------------------------------------------------------------

/**
 * Compute Konva-compatible props from an object's effects configuration.
 * Returns props for drop shadow, outer glow, and stroke that can be spread
 * onto any Konva shape node.
 */
function computeEffectProps(effects?: ObjectEffects): Record<string, unknown> {
  if (!effects) return {};
  const props: Record<string, unknown> = {};

  // Drop shadow: uses Konva's built-in shadow support
  if (effects.dropShadow?.enabled) {
    const ds = effects.dropShadow;
    const rad = (ds.angle * Math.PI) / 180;
    props.shadowColor = ds.color;
    props.shadowBlur = ds.blur;
    props.shadowOffsetX = Math.cos(rad) * ds.distance;
    props.shadowOffsetY = Math.sin(rad) * ds.distance;
    props.shadowOpacity = ds.opacity;
    props.shadowEnabled = true;
  }

  // Outer glow: like drop shadow but with zero offset
  // Only apply if drop shadow is not already active (Konva has one shadow per node)
  if (effects.outerGlow?.enabled && !effects.dropShadow?.enabled) {
    const og = effects.outerGlow;
    props.shadowColor = og.color;
    props.shadowBlur = og.blur + og.spread;
    props.shadowOffsetX = 0;
    props.shadowOffsetY = 0;
    props.shadowOpacity = og.opacity;
    props.shadowEnabled = true;
  }

  // Stroke effect -- Konva draws strokes centered by default
  if (effects.stroke?.enabled) {
    const s = effects.stroke;
    props.stroke = s.color;
    props.strokeEnabled = true;
    if (s.position === "inside" || s.position === "outside") {
      props.strokeWidth = s.width * 2;
      props.strokeScaleEnabled = false;
    } else {
      props.strokeWidth = s.width;
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// Canvas Object Renderer (Issue #3: wire move tool handlers)
// ---------------------------------------------------------------------------

function CanvasObjectRenderer({
  obj,
  isMoveTool,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: {
  obj: CanvasObject;
  isMoveTool: boolean;
  onSelect?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
}) {
  const draggable = isMoveTool;
  // FIX 5: Compute effect props (drop shadow, outer glow, stroke) for all shapes
  const fx = computeEffectProps(obj.effects);

  switch (obj.type) {
    case "line": {
      const a = obj.attrs;
      return (
        <Line
          id={obj.id}
          points={a.points}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          tension={a.tension}
          lineCap={a.lineCap}
          lineJoin={a.lineJoin}
          dash={a.dash}
          opacity={a.opacity}
          globalCompositeOperation={
            a.globalCompositeOperation as "source-over" | "destination-out" | undefined
          }
          {...fx}
          shadowBlur={a.shadowBlur ?? (fx.shadowBlur as number | undefined)}
          shadowColor={a.shadowColor ?? (fx.shadowColor as string | undefined)}
          shadowOffsetX={a.shadowOffsetX ?? (fx.shadowOffsetX as number | undefined)}
          shadowOffsetY={a.shadowOffsetY ?? (fx.shadowOffsetY as number | undefined)}
        />
      );
    }
    case "rect": {
      const a = obj.attrs;
      return (
        <Rect
          id={obj.id}
          x={a.x}
          y={a.y}
          width={a.width}
          height={a.height}
          scaleX={a.scaleX ?? 1}
          scaleY={a.scaleY ?? 1}
          fill={a.fill}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          cornerRadius={a.cornerRadius}
          dash={a.dash}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "ellipse": {
      const a = obj.attrs;
      return (
        <Ellipse
          id={obj.id}
          x={a.x}
          y={a.y}
          radiusX={a.radiusX}
          radiusY={a.radiusY}
          scaleX={a.scaleX ?? 1}
          scaleY={a.scaleY ?? 1}
          fill={a.fill}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          dash={a.dash}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "text": {
      const a = obj.attrs;
      return (
        <Text
          id={obj.id}
          x={a.x}
          y={a.y}
          text={a.text}
          fontFamily={a.fontFamily}
          fontSize={a.fontSize}
          fontStyle={a.fontStyle}
          textDecoration={a.textDecoration}
          align={a.align}
          fill={a.fill}
          lineHeight={a.lineHeight}
          letterSpacing={a.letterSpacing}
          width={a.width}
          height={a.height}
          scaleX={a.scaleX ?? 1}
          scaleY={a.scaleY ?? 1}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "arrow": {
      const a = obj.attrs;
      return (
        <Arrow
          id={obj.id}
          points={a.points}
          fill={a.fill}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          pointerLength={a.pointerLength}
          pointerWidth={a.pointerWidth}
          dash={a.dash}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "polygon": {
      const a = obj.attrs;
      return (
        <RegularPolygon
          id={obj.id}
          x={a.x}
          y={a.y}
          sides={a.sides}
          radius={a.radius}
          scaleX={a.scaleX ?? 1}
          scaleY={a.scaleY ?? 1}
          fill={a.fill}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          dash={a.dash}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "star": {
      const a = obj.attrs;
      return (
        <Star
          id={obj.id}
          x={a.x}
          y={a.y}
          numPoints={a.numPoints}
          innerRadius={a.innerRadius}
          outerRadius={a.outerRadius}
          scaleX={a.scaleX ?? 1}
          scaleY={a.scaleY ?? 1}
          fill={a.fill}
          stroke={a.stroke}
          strokeWidth={a.strokeWidth}
          dash={a.dash}
          rotation={a.rotation}
          opacity={a.opacity}
          draggable={draggable}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          {...fx}
        />
      );
    }
    case "image":
      return (
        <ImageObject
          obj={obj}
          onClick={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          draggable={draggable}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tool handler dispatcher
// ---------------------------------------------------------------------------

function useActiveToolHandlers(stageRef: React.RefObject<Konva.Stage | null>) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const magicWandTolerance = useEditorStore((s) => s.magicWandTolerance);
  const magicWandContiguous = useEditorStore((s) => s.magicWandContiguous);

  const brushTool = useBrushTool();
  const eraserTool = useEraserTool();
  const cloneStampTool = useCloneStampTool(stageRef);
  const dodgeBurnTool = useDodgeBurnTool(stageRef);
  const pixelBrushTool = usePixelBrushTool(stageRef);
  const shapeTool = useShapeTool();
  const textTool = useTextTool();
  const fillTool = useFillTool(stageRef);
  const gradientTool = useGradientTool();
  const moveTool = useMoveTool();
  const selectionTool = useSelectionTool();
  const transformTool = useTransformTool();
  const eyedropperTool = useEyedropperTool({ stageRef, sampleSize: 1 });

  useEffect(() => {
    const typeMap: Record<string, "rect" | "ellipse" | "lasso"> = {
      "marquee-rect": "rect",
      "marquee-ellipse": "ellipse",
      "lasso-free": "lasso",
      "lasso-poly": "lasso",
    };
    const mapped = typeMap[activeTool];
    if (mapped) {
      selectionTool.setSelectionType(mapped);
    }
  }, [activeTool, selectionTool.setSelectionType]);

  const selectionHandlers = useMemo(
    () => ({
      handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (!pointer) return;
        const pos = { x: (pointer.x - panOffset.x) / zoom, y: (pointer.y - panOffset.y) / zoom };
        selectionTool.onMouseDown(pos, stage ?? undefined);
      },
      handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const pointer = e.target.getStage()?.getPointerPosition();
        if (!pointer) return;
        const pos = { x: (pointer.x - panOffset.x) / zoom, y: (pointer.y - panOffset.y) / zoom };
        selectionTool.onMouseMove(pos);
      },
      handleMouseUp: () => {
        selectionTool.onMouseUp();
      },
    }),
    [selectionTool, zoom, panOffset],
  );

  const magicWandHandlers = useMemo(
    () => ({
      handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (!pointer || !stage) return;
        const pos = { x: (pointer.x - panOffset.x) / zoom, y: (pointer.y - panOffset.y) / zoom };
        selectionTool.magicWandSelect(stage, pos.x, pos.y, magicWandTolerance, magicWandContiguous);
      },
      handleMouseMove: () => {},
      handleMouseUp: () => {},
    }),
    [selectionTool, zoom, panOffset, magicWandTolerance, magicWandContiguous],
  );

  const eyedropperHandlers = useMemo(
    () => ({
      handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        eyedropperTool.handleEyedropperClick(e);
      },
      handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => {
        eyedropperTool.handleEyedropperMove(e);
      },
      handleMouseUp: () => {},
    }),
    [eyedropperTool],
  );

  const zoomHandlers = useMemo(
    () => ({
      handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        const isAlt = e.evt.altKey;
        const state = useEditorStore.getState();
        const factor = isAlt ? 1 / 1.5 : 1.5;
        state.setZoom(state.zoom * factor);
      },
      handleMouseMove: () => {},
      handleMouseUp: () => {},
    }),
    [],
  );

  type ToolHandlers = {
    handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseUp: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  };

  const handlers = useMemo(() => {
    const toolMap: Record<string, ToolHandlers> = {
      brush: brushTool,
      pencil: brushTool,
      eraser: eraserTool,
      "clone-stamp": cloneStampTool,
      dodge: dodgeBurnTool,
      burn: dodgeBurnTool,
      sponge: dodgeBurnTool,
      "blur-brush": pixelBrushTool,
      "sharpen-brush": pixelBrushTool,
      smudge: pixelBrushTool,
      "shape-rect": shapeTool,
      "shape-ellipse": shapeTool,
      "shape-line": shapeTool,
      "shape-arrow": shapeTool,
      "shape-polygon": shapeTool,
      "shape-star": shapeTool,
      text: textTool,
      fill: fillTool,
      gradient: gradientTool,
      eyedropper: eyedropperHandlers,
      zoom: zoomHandlers,
      "marquee-rect": selectionHandlers,
      "marquee-ellipse": selectionHandlers,
      "lasso-free": selectionHandlers,
      "lasso-poly": selectionHandlers,
      "magic-wand": magicWandHandlers,
    };

    return toolMap[activeTool] ?? null;
  }, [
    activeTool,
    brushTool,
    eraserTool,
    cloneStampTool,
    dodgeBurnTool,
    pixelBrushTool,
    shapeTool,
    textTool,
    fillTool,
    gradientTool,
    eyedropperHandlers,
    zoomHandlers,
    selectionHandlers,
    magicWandHandlers,
  ]);

  return { handlers, moveTool, selectionTool, transformTool };
}

// ---------------------------------------------------------------------------
// Main Canvas Component
// ---------------------------------------------------------------------------

export function EditorCanvas({
  onCanvasResize,
  onImageResize,
}: {
  onCanvasResize?: () => void;
  onImageResize?: () => void;
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionLayerRef = useRef<Konva.Layer>(null);
  const { stageRef, handleWheel, fitToScreen, handleTouchMove, handleTouchEnd } = useCanvasZoom();

  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const objects = useEditorStore((s) => s.objects);
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setPanOffset = useEditorStore((s) => s.setPanOffset);
  const adjustments = useEditorStore((s) => s.adjustments);
  const filters = useEditorStore((s) => s.filters);
  const levels = useEditorStore((s) => s.levels);
  const curves = useEditorStore((s) => s.curves);

  // Issue #10: Shortcuts moved to EditorPage, removed from here
  const cursor = useEditorCursor();
  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const contextMenu = useContextMenu();

  const { handlers, moveTool, selectionTool, transformTool } = useActiveToolHandlers(stageRef);

  const [stageWidth, setStageWidth] = useState(800);
  const [stageHeight, setStageHeight] = useState(600);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only sync of stable ref
  useEffect(() => {
    editorStageRefHolder.current = stageRef.current;
    return () => {
      editorStageRefHolder.current = null;
    };
  }, []);

  // Issue #5: Track raw screen cursor position for brush overlay
  const [screenCursor, setScreenCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageWidth(width);
      setStageHeight(height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sourceImageUrl && stageWidth > 0 && stageHeight > 0) {
      fitToScreen(stageWidth, stageHeight, canvasSize.width, canvasSize.height);
    }
  }, [sourceImageUrl, stageWidth, stageHeight, canvasSize.width, canvasSize.height, fitToScreen]);

  // Group objects by layer
  const objectsByLayer = useMemo(() => {
    const grouped = new Map<string, CanvasObject[]>();
    for (const layer of layers) {
      grouped.set(layer.id, []);
    }
    for (const obj of objects) {
      const existing = grouped.get(obj.layerId);
      if (existing) {
        existing.push(obj);
      }
    }
    return grouped;
  }, [objects, layers]);

  const isMoveTool = activeTool === "move";

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const x = Math.round((pointer.x - panOffset.x) / zoom);
      const y = Math.round((pointer.y - panOffset.y) / zoom);
      setCursorPosition({ x, y });

      // Forward to active tool
      if (handlers) {
        handlers.handleMouseMove(e);
      }
    },
    [zoom, panOffset, setCursorPosition, handlers],
  );

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // For move tool, handle stage click to deselect
      if (activeTool === "move") {
        moveTool.onStageClick(e);
      }

      if (handlers) {
        handlers.handleMouseDown(e);
      }
    },
    [handlers, activeTool, moveTool],
  );

  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (handlers) {
        handlers.handleMouseUp(e);
      }
    },
    [handlers],
  );

  // Issue #5: Track screen-space cursor for brush overlay
  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setScreenCursor({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const checkerboardSize = CHECKERBOARD_SIZE * zoom;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: canvas container tracks cursor for brush overlay
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      style={{
        cursor,
        background: sourceImageUrl ? CHECKERBOARD_CSS : undefined,
        backgroundSize: sourceImageUrl ? `${checkerboardSize}px ${checkerboardSize}px` : undefined,
        backgroundPosition: sourceImageUrl ? `${panOffset.x}px ${panOffset.y}px` : undefined,
      }}
      data-testid="editor-canvas"
      onMouseMove={handleContainerMouseMove}
      onContextMenu={(e) => contextMenu.handleContextMenu(e, selectedObjectIds.length > 0)}
    >
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={zoom}
        scaleY={zoom}
        x={panOffset.x}
        y={panOffset.y}
        draggable={activeTool === "hand"}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragEnd={(e) => {
          if (activeTool === "hand") {
            const stage = e.target.getStage();
            if (stage) {
              setPanOffset({ x: stage.x(), y: stage.y() });
            }
          }
        }}
      >
        {/* Render objects grouped by layer */}
        <Layer ref={selectionLayerRef}>
          {/* Issue #14: Render source image as background */}
          {sourceImageUrl && (
            <SourceImage
              url={sourceImageUrl}
              adjustments={adjustments}
              filters={filters}
              levels={levels}
              curves={curves}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
            />
          )}

          {layers.map((layer) => {
            const layerObjects = objectsByLayer.get(layer.id) ?? [];
            if (!layer.visible) return null;
            return (
              <Group
                key={layer.id}
                opacity={layer.opacity}
                globalCompositeOperation={
                  layer.blendMode !== "normal"
                    ? (layer.blendMode as GlobalCompositeOperation)
                    : undefined
                }
                listening={layer.id === activeLayerId}
              >
                {layerObjects.map((obj) => {
                  // A locked layer's objects can't be selected, dragged, or transformed.
                  const editable = isMoveTool && !layer.locked;
                  return (
                    <CanvasObjectRenderer
                      key={obj.id}
                      obj={obj}
                      isMoveTool={editable}
                      onSelect={editable ? moveTool.onSelect : undefined}
                      onDragStart={editable ? moveTool.onDragStart : undefined}
                      onDragMove={editable ? moveTool.onDragMove : undefined}
                      onDragEnd={editable ? moveTool.onDragEnd : undefined}
                      onTransformEnd={editable ? moveTool.onTransformEnd : undefined}
                    />
                  );
                })}
              </Group>
            );
          })}

          {/* Move tool transformer */}
          {activeTool === "move" && (
            <MoveToolTransformer transformerRef={moveTool.transformerRef} />
          )}

          {activeTool === "move" && <SmartGuidesOverlay guides={moveTool.smartGuides} />}

          {/* Transform tool transformer */}
          {activeTool === "transform" && (
            <TransformToolTransformer transformerRef={transformTool.transformerRef} />
          )}

          {/* Selection overlay (marching ants) */}
          <SelectionOverlay layerRef={selectionLayerRef} />

          {/* Active selection preview (drawn while dragging) */}
          {selectionTool.isDrawing && selectionTool.currentPoints.length >= 4 && (
            <ActiveSelectionPreview
              type={selectionTool.selectionType}
              points={selectionTool.currentPoints}
            />
          )}
        </Layer>

        {/* Crop overlay layer */}
        {activeTool === "crop" && (
          <Layer>
            <CropOverlay />
          </Layer>
        )}

        {/* Grid overlay layer (Feature 49) - non-interactive */}
        {(gridVisible || zoom >= 8) && (
          <Layer listening={false}>
            <GridOverlay
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              zoom={zoom}
              panOffset={panOffset}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              showGrid={gridVisible}
              showPixelGrid={zoom >= 8}
            />
          </Layer>
        )}
      </Stage>
      <BrushCursorOverlay containerRef={containerRef} screenCursor={screenCursor} />
      <LoadingOverlay />
      {contextMenu.position && (
        <ContextMenu
          position={contextMenu.position}
          menuType={contextMenu.menuType}
          onClose={contextMenu.close}
          onCanvasResize={onCanvasResize}
          onImageResize={onImageResize}
        />
      )}
    </div>
  );
}

function GridOverlay({
  canvasWidth,
  canvasHeight,
  zoom,
  panOffset,
  stageWidth,
  stageHeight,
  showGrid,
  showPixelGrid,
}: {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  panOffset: { x: number; y: number };
  stageWidth: number;
  stageHeight: number;
  showGrid: boolean;
  showPixelGrid: boolean;
}) {
  return (
    <Shape
      sceneFunc={(ctx, _shape) => {
        ctx.beginPath();

        if (showGrid) {
          const spacing = 50;
          ctx.strokeStyle = "rgba(128, 128, 128, 0.15)";
          ctx.lineWidth = 1 / zoom;
          for (let x = spacing; x < canvasWidth; x += spacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
          }
          for (let y = spacing; y < canvasHeight; y += spacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(canvasWidth, y);
          }
          ctx.stroke();
        }

        // FIX 7: Clip pixel grid to the visible viewport to avoid drawing
        // thousands of lines for large images. Cap at 200 lines per axis.
        if (showPixelGrid) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(128, 128, 128, 0.1)";
          ctx.lineWidth = 1 / zoom;

          // Calculate visible region in canvas coordinates from pan/zoom
          const visMinX = Math.max(0, Math.floor(-panOffset.x / zoom));
          const visMinY = Math.max(0, Math.floor(-panOffset.y / zoom));
          const visMaxX = Math.min(canvasWidth, Math.ceil((stageWidth - panOffset.x) / zoom));
          const visMaxY = Math.min(canvasHeight, Math.ceil((stageHeight - panOffset.y) / zoom));

          const MAX_LINES = 200;

          // Determine step: if visible range exceeds max lines, skip pixels
          const xRange = visMaxX - visMinX;
          const yRange = visMaxY - visMinY;
          const xStep = xRange > MAX_LINES ? Math.ceil(xRange / MAX_LINES) : 1;
          const yStep = yRange > MAX_LINES ? Math.ceil(yRange / MAX_LINES) : 1;

          // Align start to step boundary
          const startX = Math.max(1, visMinX - (visMinX % xStep) + xStep);
          const startY = Math.max(1, visMinY - (visMinY % yStep) + yStep);

          for (let x = startX; x < visMaxX; x += xStep) {
            ctx.moveTo(x, visMinY);
            ctx.lineTo(x, visMaxY);
          }
          for (let y = startY; y < visMaxY; y += yStep) {
            ctx.moveTo(visMinX, y);
            ctx.lineTo(visMaxX, y);
          }
          ctx.stroke();
        }
      }}
    />
  );
}
