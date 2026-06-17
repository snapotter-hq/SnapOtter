import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ellipse, Group, Line, Rect, Shape } from "react-konva";
import { useEditorStore } from "@/stores/editor-store";
import type { SelectionMode, SelectionState } from "@/types/editor";
import { captureDocumentCanvas } from "../stage-capture";

type SelectionType = "rect" | "ellipse" | "lasso";

// ---------------------------------------------------------------------------
// Marching ants animation
// ---------------------------------------------------------------------------

const DASH = [6, 4];
const MARCH_SPEED = 1;

function useMarchingAnts(layerRef: React.RefObject<Konva.Layer | null>) {
  const dashOffsetRef = useRef(0);
  const animRef = useRef<Konva.Animation | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    // Dynamically import Konva for Animation
    import("konva").then((KonvaModule) => {
      const anim = new KonvaModule.default.Animation(() => {
        dashOffsetRef.current -= MARCH_SPEED;
      }, layer);
      animRef.current = anim;
      anim.start();
    });

    return () => {
      animRef.current?.stop();
    };
  }, [layerRef]);

  return dashOffsetRef;
}

// ---------------------------------------------------------------------------
// Magic wand -- flood fill to generate selection mask
// ---------------------------------------------------------------------------

function floodFillMask(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean,
): boolean[][] {
  const { width, height, data } = imageData;
  const mask: boolean[][] = Array.from(
    { length: height },
    () => Array(width).fill(false) as boolean[],
  );

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return mask;

  const idx = (sy * width + sx) * 4;
  const targetR = data[idx];
  const targetG = data[idx + 1];
  const targetB = data[idx + 2];
  const targetA = data[idx + 3];

  const tolSq = tolerance * tolerance;

  function matchesAt(i: number): boolean {
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return dr * dr + dg * dg + db * db + da * da <= tolSq;
  }

  if (contiguous) {
    const visited = new Uint8Array(width * height);
    const stack: [number, number][] = [[sx, sy]];

    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) break;
      const [seedX, seedY] = entry;
      let x = seedX;

      while (
        x > 0 &&
        !visited[seedY * width + (x - 1)] &&
        matchesAt((seedY * width + (x - 1)) * 4)
      ) {
        x--;
      }

      let spanAbove = false;
      let spanBelow = false;

      while (x < width && !visited[seedY * width + x] && matchesAt((seedY * width + x) * 4)) {
        visited[seedY * width + x] = 1;
        mask[seedY][x] = true;

        if (seedY > 0) {
          const aboveIdx = (seedY - 1) * width + x;
          if (!visited[aboveIdx] && matchesAt(aboveIdx * 4)) {
            if (!spanAbove) {
              stack.push([x, seedY - 1]);
              spanAbove = true;
            }
          } else {
            spanAbove = false;
          }
        }

        if (seedY < height - 1) {
          const belowIdx = (seedY + 1) * width + x;
          if (!visited[belowIdx] && matchesAt(belowIdx * 4)) {
            if (!spanBelow) {
              stack.push([x, seedY + 1]);
              spanBelow = true;
            }
          } else {
            spanBelow = false;
          }
        }

        x++;
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (matchesAt((y * width + x) * 4)) {
          mask[y][x] = true;
        }
      }
    }
  }

  return mask;
}

function maskToBounds(
  mask: boolean[][],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < mask[y].length; x++) {
      if (mask[y][x]) {
        found = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// ---------------------------------------------------------------------------
// Selection mask modification utilities
// ---------------------------------------------------------------------------

export function expandMask(mask: boolean[][], amount: number): boolean[][] {
  const h = mask.length;
  const w = mask[0]?.length ?? 0;
  const result: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false) as boolean[]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      for (let dy = -amount; dy <= amount; dy++) {
        for (let dx = -amount; dx <= amount; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            if (dx * dx + dy * dy <= amount * amount) {
              result[ny][nx] = true;
            }
          }
        }
      }
    }
  }
  return result;
}

export function contractMask(mask: boolean[][], amount: number): boolean[][] {
  const inverted = mask.map((row) => row.map((v) => !v));
  const expanded = expandMask(inverted, amount);
  return expanded.map((row) => row.map((v) => !v));
}

export function featherMask(mask: boolean[][], radius: number): number[][] {
  const h = mask.length;
  const w = mask[0]?.length ?? 0;
  const result: number[][] = Array.from({ length: h }, () => Array(w).fill(0) as number[]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x]) {
        result[y][x] = 1;
        continue;
      }
      // Distance to nearest mask pixel within radius
      let minDist = radius + 1;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w && mask[ny][nx]) {
            const d = Math.sqrt(dx * dx + dy * dy);
            minDist = Math.min(minDist, d);
          }
        }
      }
      if (minDist <= radius) {
        result[y][x] = 1 - minDist / radius;
      }
    }
  }
  return result;
}

export function invertMask(mask: boolean[][]): boolean[][] {
  return mask.map((row) => row.map((v) => !v));
}

/** Ray-casting point-in-polygon test */
export function pointInPolygon(x: number, y: number, points: number[]): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Hook: useSelectionTool
// ---------------------------------------------------------------------------

export interface SelectionToolApi {
  selectionType: SelectionType;
  setSelectionType: (t: SelectionType) => void;
  isDrawing: boolean;
  currentPoints: number[];
  onMouseDown: (pos: { x: number; y: number }, stage?: Konva.Stage) => void;
  onMouseMove: (pos: { x: number; y: number }) => void;
  onMouseUp: () => void;
  onDoubleClick: () => void;
  selectAll: () => void;
  deselect: () => void;
  magicWandSelect: (
    stage: Konva.Stage,
    x: number,
    y: number,
    tolerance: number,
    contiguous: boolean,
  ) => void;
}

export function useSelectionTool(): SelectionToolApi {
  const [selectionType, setSelectionType] = useState<SelectionType>("rect");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);
  // Polygon vertices for lasso-poly mode
  const polyVerticesRef = useRef<number[]>([]);

  const selectionMode = useEditorStore((s) => s.selectionMode);

  const setSelection = useEditorStore((s) => s.setSelection);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const existingSelection = useEditorStore((s) => s.selection);

  const mergeSelection = useCallback(
    (newSel: SelectionState, mode: SelectionMode) => {
      if (mode === "new" || !existingSelection) {
        setSelection(newSel);
        return;
      }

      const eb = existingSelection.bounds;
      const nb = newSel.bounds;

      if (mode === "add") {
        // Union of the two bounding boxes
        const x = Math.min(eb.x, nb.x);
        const y = Math.min(eb.y, nb.y);
        const right = Math.max(eb.x + eb.width, nb.x + nb.width);
        const bottom = Math.max(eb.y + eb.height, nb.y + nb.height);

        // For mask-based selections (wand, lasso), merge masks
        if (existingSelection.mask && newSel.mask) {
          const unionW = right - x;
          const unionH = bottom - y;
          const merged = new Uint8Array(unionW * unionH);
          // Copy existing mask into merged
          for (let row = 0; row < eb.height; row++) {
            for (let col = 0; col < eb.width; col++) {
              const si = row * eb.width + col;
              const di = (row + eb.y - y) * unionW + (col + eb.x - x);
              if (existingSelection.mask[si]) merged[di] = 1;
            }
          }
          // OR new mask into merged
          for (let row = 0; row < nb.height; row++) {
            for (let col = 0; col < nb.width; col++) {
              const si = row * nb.width + col;
              const di = (row + nb.y - y) * unionW + (col + nb.x - x);
              if (newSel.mask?.[si]) merged[di] = 1;
            }
          }
          setSelection({
            type: newSel.type,
            points: [],
            bounds: { x, y, width: unionW, height: unionH },
            mask: merged,
          });
        } else {
          setSelection({
            ...newSel,
            bounds: { x, y, width: right - x, height: bottom - y },
          });
        }
      } else {
        // Subtract mode: remove the intersection of the new selection from the existing one
        if (existingSelection.mask && newSel.mask) {
          // Mask-based subtract: AND inverse of new mask with old mask
          const result = new Uint8Array(eb.width * eb.height);
          for (let row = 0; row < eb.height; row++) {
            for (let col = 0; col < eb.width; col++) {
              const absX = eb.x + col;
              const absY = eb.y + row;
              const ei = row * eb.width + col;
              // Check if this pixel is in the new selection's mask
              const relX = absX - nb.x;
              const relY = absY - nb.y;
              let inNew = false;
              if (relX >= 0 && relX < nb.width && relY >= 0 && relY < nb.height) {
                inNew = newSel.mask?.[relY * nb.width + relX] === 1;
              }
              result[ei] = existingSelection.mask[ei] && !inNew ? 1 : 0;
            }
          }
          setSelection({
            type: existingSelection.type,
            points: existingSelection.points,
            bounds: eb,
            mask: result,
          });
        } else {
          // Geometric subtract for rectangular selections
          // If the new selection fully contains the old one, deselect
          if (
            nb.x <= eb.x &&
            nb.y <= eb.y &&
            nb.x + nb.width >= eb.x + eb.width &&
            nb.y + nb.height >= eb.y + eb.height
          ) {
            setSelection(null);
            return;
          }
          // Otherwise keep the existing selection with its bounds reduced where they overlap
          // This is a simplified approach: we keep the existing bounds but trim from the side
          // with the largest overlap
          const overlapX1 = Math.max(eb.x, nb.x);
          const overlapY1 = Math.max(eb.y, nb.y);
          const overlapX2 = Math.min(eb.x + eb.width, nb.x + nb.width);
          const overlapY2 = Math.min(eb.y + eb.height, nb.y + nb.height);

          // No overlap means nothing to subtract
          if (overlapX2 <= overlapX1 || overlapY2 <= overlapY1) {
            return;
          }

          // Determine which side the overlap is on and trim accordingly
          const trimLeft = overlapX1 === eb.x ? overlapX2 - eb.x : 0;
          const trimRight = overlapX2 === eb.x + eb.width ? eb.x + eb.width - overlapX1 : 0;
          const trimTop = overlapY1 === eb.y ? overlapY2 - eb.y : 0;
          const trimBottom = overlapY2 === eb.y + eb.height ? eb.y + eb.height - overlapY1 : 0;

          const maxTrim = Math.max(trimLeft, trimRight, trimTop, trimBottom);
          let newBounds = { ...eb };
          if (maxTrim === trimLeft && trimLeft > 0) {
            newBounds = {
              x: eb.x + trimLeft,
              y: eb.y,
              width: eb.width - trimLeft,
              height: eb.height,
            };
          } else if (maxTrim === trimRight && trimRight > 0) {
            newBounds = { x: eb.x, y: eb.y, width: eb.width - trimRight, height: eb.height };
          } else if (maxTrim === trimTop && trimTop > 0) {
            newBounds = {
              x: eb.x,
              y: eb.y + trimTop,
              width: eb.width,
              height: eb.height - trimTop,
            };
          } else if (maxTrim === trimBottom && trimBottom > 0) {
            newBounds = { x: eb.x, y: eb.y, width: eb.width, height: eb.height - trimBottom };
          }

          if (newBounds.width <= 0 || newBounds.height <= 0) {
            setSelection(null);
          } else {
            setSelection({
              type: existingSelection.type,
              points: existingSelection.points,
              bounds: newBounds,
            });
          }
        }
      }
    },
    [existingSelection, setSelection],
  );

  const isPolyLasso = useCallback(() => {
    return useEditorStore.getState().activeTool === "lasso-poly";
  }, []);

  const onMouseDown = useCallback(
    (pos: { x: number; y: number }, _stage?: Konva.Stage) => {
      if (selectionType === "lasso" && isPolyLasso()) {
        // Polygonal lasso: each click adds a vertex
        if (!isDrawingRef.current) {
          // Start a new polygon
          setIsDrawing(true);
          isDrawingRef.current = true;
          polyVerticesRef.current = [pos.x, pos.y];
          setCurrentPoints([pos.x, pos.y]);
        } else {
          // Add another vertex
          polyVerticesRef.current = [...polyVerticesRef.current, pos.x, pos.y];
          setCurrentPoints([...polyVerticesRef.current]);
        }
      } else {
        // Freehand lasso, rect, or ellipse
        setIsDrawing(true);
        isDrawingRef.current = true;
        startRef.current = pos;
        if (selectionType === "lasso") {
          setCurrentPoints([pos.x, pos.y]);
        } else {
          setCurrentPoints([]);
        }
      }
    },
    [selectionType, isPolyLasso],
  );

  const onMouseMove = useCallback(
    (pos: { x: number; y: number }) => {
      if (!isDrawingRef.current) return;

      if (selectionType === "lasso" && isPolyLasso()) {
        // Polygonal lasso: show rubber band line from last vertex to cursor
        const verts = polyVerticesRef.current;
        setCurrentPoints([...verts, pos.x, pos.y]);
      } else if (selectionType === "lasso") {
        // Freehand lasso
        setCurrentPoints((prev) => [...prev, pos.x, pos.y]);
      } else {
        const s = startRef.current;
        setCurrentPoints([s.x, s.y, pos.x, pos.y]);
      }
    },
    [selectionType, isPolyLasso],
  );

  const finalizeLasso = useCallback(
    (points: number[]) => {
      if (points.length < 6) {
        setSelection(null);
        setCurrentPoints([]);
        return;
      }
      const xs = points.filter((_, i) => i % 2 === 0);
      const ys = points.filter((_, i) => i % 2 === 1);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      mergeSelection({ type: "lasso", points, bounds }, selectionMode);
      setCurrentPoints([]);
    },
    [selectionMode, mergeSelection, setSelection],
  );

  const onMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return;

    if (selectionType === "lasso" && isPolyLasso()) {
      // Polygonal lasso: mouseUp does NOT close the polygon, only dblclick does.
      // The vertex was already added in onMouseDown, so nothing to do here.
      return;
    }

    setIsDrawing(false);
    isDrawingRef.current = false;

    if (selectionType === "lasso") {
      finalizeLasso(currentPoints);
    } else {
      if (currentPoints.length < 4) {
        setCurrentPoints([]);
        return;
      }
      const [x1, y1, x2, y2] = currentPoints;
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w < 2 || h < 2) {
        setSelection(null);
        setCurrentPoints([]);
        return;
      }
      mergeSelection(
        {
          type: selectionType,
          points: [],
          bounds: { x, y, width: w, height: h },
        },
        selectionMode,
      );
    }
    setCurrentPoints([]);
  }, [
    currentPoints,
    selectionType,
    selectionMode,
    mergeSelection,
    setSelection,
    finalizeLasso,
    isPolyLasso,
  ]);

  const onDoubleClick = useCallback(() => {
    // Close polygonal lasso
    if (selectionType === "lasso" && isDrawingRef.current) {
      setIsDrawing(false);
      isDrawingRef.current = false;
      const verts = polyVerticesRef.current;
      finalizeLasso(verts);
      polyVerticesRef.current = [];
    }
  }, [selectionType, finalizeLasso]);

  const selectAll = useCallback(() => {
    setSelection({
      type: "rect",
      points: [],
      bounds: { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
    });
  }, [canvasSize, setSelection]);

  const deselect = useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  const magicWandSelect = useCallback(
    (stage: Konva.Stage, x: number, y: number, tolerance: number, contiguous: boolean) => {
      // Capture the document at document resolution, ignoring zoom/pan.
      const canvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
      const mask = floodFillMask(imageData, x, y, tolerance, contiguous);
      const bounds = maskToBounds(mask);
      if (!bounds) return;

      // Convert the boolean[][] mask to a flat Uint8Array within the bounds region
      const flatMask = new Uint8Array(bounds.width * bounds.height);
      for (let row = 0; row < bounds.height; row++) {
        for (let col = 0; col < bounds.width; col++) {
          flatMask[row * bounds.width + col] = mask[bounds.y + row][bounds.x + col] ? 1 : 0;
        }
      }

      mergeSelection({ type: "wand", points: [], bounds, mask: flatMask }, selectionMode);
    },
    [selectionMode, mergeSelection, canvasSize],
  );

  return {
    selectionType,
    setSelectionType,
    isDrawing,
    currentPoints,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
    selectAll,
    deselect,
    magicWandSelect,
  };
}

// ---------------------------------------------------------------------------
// SelectionOverlay -- renders selection outline with marching ants
// ---------------------------------------------------------------------------

function maskToEdgePoints(
  mask: Uint8Array,
  bounds: { x: number; y: number; width: number; height: number },
): number[] {
  const { width: w, height: h, x: ox, y: oy } = bounds;
  const pts: number[] = [];

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!mask[row * w + col]) continue;
      const ax = ox + col;
      const ay = oy + row;
      if (col === 0 || !mask[row * w + (col - 1)]) pts.push(ax, ay, ax, ay + 1);
      if (col === w - 1 || !mask[row * w + (col + 1)]) pts.push(ax + 1, ay, ax + 1, ay + 1);
      if (row === 0 || !mask[(row - 1) * w + col]) pts.push(ax, ay, ax + 1, ay);
      if (row === h - 1 || !mask[(row + 1) * w + col]) pts.push(ax, ay + 1, ax + 1, ay + 1);
    }
  }
  return pts;
}

export function SelectionOverlay({ layerRef }: { layerRef: React.RefObject<Konva.Layer | null> }) {
  const selection = useEditorStore((s) => s.selection);
  const dashOffset = useMarchingAnts(layerRef);

  if (!selection) return null;

  const { type, bounds, points, mask } = selection;

  if (type === "lasso" && points.length >= 6) {
    return (
      <Group>
        <Line
          points={points}
          closed
          stroke="#000000"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current}
          listening={false}
        />
        <Line
          points={points}
          closed
          stroke="#ffffff"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current + DASH[0]}
          listening={false}
        />
      </Group>
    );
  }

  if (type === "ellipse") {
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    return (
      <Group>
        <Ellipse
          x={bounds.x + rx}
          y={bounds.y + ry}
          radiusX={rx}
          radiusY={ry}
          stroke="#000000"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current}
          listening={false}
        />
        <Ellipse
          x={bounds.x + rx}
          y={bounds.y + ry}
          radiusX={rx}
          radiusY={ry}
          stroke="#ffffff"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current + DASH[0]}
          listening={false}
        />
      </Group>
    );
  }

  if (type === "wand" && mask) {
    const pts = maskToEdgePoints(mask, bounds);
    return (
      <Group listening={false}>
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            for (let i = 0; i < pts.length; i += 4) {
              ctx.moveTo(pts[i], pts[i + 1]);
              ctx.lineTo(pts[i + 2], pts[i + 3]);
            }
            ctx.strokeShape(shape);
          }}
          stroke="#000000"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current}
          listening={false}
        />
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            for (let i = 0; i < pts.length; i += 4) {
              ctx.moveTo(pts[i], pts[i + 1]);
              ctx.lineTo(pts[i + 2], pts[i + 3]);
            }
            ctx.strokeShape(shape);
          }}
          stroke="#ffffff"
          strokeWidth={1}
          dash={DASH}
          dashOffset={dashOffset.current + DASH[0]}
          listening={false}
        />
      </Group>
    );
  }

  // Rectangular selection
  return (
    <Group>
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        stroke="#000000"
        strokeWidth={1}
        dash={DASH}
        dashOffset={dashOffset.current}
        listening={false}
      />
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        stroke="#ffffff"
        strokeWidth={1}
        dash={DASH}
        dashOffset={dashOffset.current + DASH[0]}
        listening={false}
      />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// ActiveSelectionPreview -- rendered during drag to show selection shape
// ---------------------------------------------------------------------------

export function ActiveSelectionPreview({
  type,
  points,
}: {
  type: SelectionType;
  points: number[];
}) {
  if (type === "lasso" && points.length >= 4) {
    return (
      <Line points={points} stroke="#E07832" strokeWidth={1} dash={[4, 4]} listening={false} />
    );
  }

  if (points.length < 4) return null;

  const [x1, y1, x2, y2] = points;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  if (type === "ellipse") {
    return (
      <Ellipse
        x={x + w / 2}
        y={y + h / 2}
        radiusX={w / 2}
        radiusY={h / 2}
        stroke="#E07832"
        strokeWidth={1}
        dash={[4, 4]}
        listening={false}
      />
    );
  }

  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      stroke="#E07832"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
}
