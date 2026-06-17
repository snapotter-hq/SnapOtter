import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Transformer } from "react-konva";
import { useEditorStore } from "@/stores/editor-store";

// ---------------------------------------------------------------------------
// Transform state -- position/size/rotation for the options bar
// ---------------------------------------------------------------------------

export interface TransformValues {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

// ---------------------------------------------------------------------------
// Flip helper
// ---------------------------------------------------------------------------

/**
 * Compute the attribute changes that flip an object in place along one axis.
 *
 * Points-based objects (brush/pencil strokes, lasso shapes) are mirrored by
 * reflecting their points around their own bounding-box centre. Sized objects
 * negate their scale and shift position to stay in place — the renderer applies
 * `scaleX`/`scaleY`. Ellipses are positioned by their centre, so they need no
 * position compensation.
 */
function computeFlip(attrs: Record<string, unknown>, axis: "x" | "y"): Record<string, unknown> {
  if (Array.isArray(attrs.points)) {
    const pts = attrs.points as number[];
    const offset = axis === "x" ? 0 : 1;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = offset; i < pts.length; i += 2) {
      min = Math.min(min, pts[i]);
      max = Math.max(max, pts[i]);
    }
    const sum = min + max;
    return { points: pts.map((v, i) => (i % 2 === offset ? sum - v : v)) };
  }

  const scaleKey = axis === "x" ? "scaleX" : "scaleY";
  const posKey = axis === "x" ? "x" : "y";
  const sizeKey = axis === "x" ? "width" : "height";
  const scale = (attrs[scaleKey] as number) ?? 1;
  const centred = attrs.radiusX !== undefined; // ellipses are centre-anchored
  const size = (attrs[sizeKey] as number) ?? ((attrs.radiusX as number | undefined) ?? 0) * 2;
  const pos = (attrs[posKey] as number) ?? 0;
  return centred ? { [scaleKey]: -scale } : { [scaleKey]: -scale, [posKey]: pos + scale * size };
}

// ---------------------------------------------------------------------------
// Hook: useTransformTool
// ---------------------------------------------------------------------------

export interface TransformToolApi {
  transformerRef: React.RefObject<Konva.Transformer | null>;
  isTransforming: boolean;
  values: TransformValues;
  lockedAspect: boolean;
  setLockedAspect: (v: boolean) => void;
  activate: () => void;
  applyTransform: () => void;
  cancelTransform: () => void;
  setValues: (v: Partial<TransformValues>) => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
}

export function useTransformTool(): TransformToolApi {
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [lockedAspect, setLockedAspect] = useState(false);
  const [values, setValuesState] = useState<TransformValues>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
  });
  const preTransformRef = useRef<TransformValues | null>(null);

  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const objects = useEditorStore((s) => s.objects);
  const updateObject = useEditorStore((s) => s.updateObject);
  const setTool = useEditorStore((s) => s.setTool);

  // Read values from selected object(s)
  useEffect(() => {
    if (!isTransforming) return;
    if (selectedObjectIds.length === 0) {
      const sel = useEditorStore.getState().selection;
      if (sel && sel.bounds.width > 0) {
        setValuesState({
          x: sel.bounds.x,
          y: sel.bounds.y,
          width: sel.bounds.width,
          height: sel.bounds.height,
          rotation: 0,
        });
      }
      return;
    }
    const obj = objects.find((o) => o.id === selectedObjectIds[0]);
    if (!obj) return;
    const a = obj.attrs as unknown as Record<string, unknown>;
    const v: TransformValues = {
      x: (a.x as number) ?? 0,
      y: (a.y as number) ?? 0,
      width: (a.width as number) ?? 0,
      height: (a.height as number) ?? 0,
      rotation: (a.rotation as number) ?? 0,
    };
    setValuesState(v);
  }, [isTransforming, selectedObjectIds, objects]);

  // Attach transformer
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr || !isTransforming) return;
    const stage = tr.getStage();
    if (!stage) return;

    const nodes = selectedObjectIds
      .map((id) => stage.findOne(`#${id}`))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [isTransforming, selectedObjectIds]);

  const activate = useCallback(() => {
    if (selectedObjectIds.length === 0) {
      const sel = useEditorStore.getState().selection;
      if (!sel || sel.bounds.width === 0) return;
      preTransformRef.current = {
        x: sel.bounds.x,
        y: sel.bounds.y,
        width: sel.bounds.width,
        height: sel.bounds.height,
        rotation: 0,
      };
      setValuesState({
        x: sel.bounds.x,
        y: sel.bounds.y,
        width: sel.bounds.width,
        height: sel.bounds.height,
        rotation: 0,
      });
      setIsTransforming(true);
      return;
    }
    setIsTransforming(true);
    // Store pre-transform state for cancel
    const obj = objects.find((o) => o.id === selectedObjectIds[0]);
    if (obj) {
      const a = obj.attrs as unknown as Record<string, unknown>;
      preTransformRef.current = {
        x: (a.x as number) ?? 0,
        y: (a.y as number) ?? 0,
        width: (a.width as number) ?? 0,
        height: (a.height as number) ?? 0,
        rotation: (a.rotation as number) ?? 0,
      };
    }
  }, [selectedObjectIds, objects]);

  const applyTransform = useCallback(() => {
    setIsTransforming(false);
    preTransformRef.current = null;
    setTool("move");
  }, [setTool]);

  const cancelTransform = useCallback(() => {
    // Restore pre-transform state
    if (preTransformRef.current && selectedObjectIds.length > 0) {
      const prev = preTransformRef.current;
      for (const id of selectedObjectIds) {
        updateObject(id, {
          x: prev.x,
          y: prev.y,
          width: prev.width,
          height: prev.height,
          rotation: prev.rotation,
        });
      }
    }
    setIsTransforming(false);
    preTransformRef.current = null;
    setTool("move");
  }, [selectedObjectIds, updateObject, setTool]);

  const setValues = useCallback(
    (v: Partial<TransformValues>) => {
      setValuesState((prev) => {
        const next = { ...prev, ...v };

        // If aspect is locked, derive height from width ratio or vice versa
        if (lockedAspect && prev.width > 0 && prev.height > 0) {
          const ratio = prev.width / prev.height;
          if (v.width !== undefined && v.height === undefined) {
            next.height = next.width / ratio;
          } else if (v.height !== undefined && v.width === undefined) {
            next.width = next.height * ratio;
          }
        }

        // Apply to selected objects
        for (const id of selectedObjectIds) {
          updateObject(id, {
            x: next.x,
            y: next.y,
            width: next.width,
            height: next.height,
            rotation: next.rotation,
          });
        }

        return next;
      });
    },
    [selectedObjectIds, updateObject, lockedAspect],
  );

  const flipHorizontal = useCallback(() => {
    for (const id of selectedObjectIds) {
      const obj = objects.find((o) => o.id === id);
      if (!obj) continue;
      const update = computeFlip(obj.attrs as unknown as Record<string, unknown>, "x");
      updateObject(id, update as Partial<typeof obj.attrs>);
    }
  }, [selectedObjectIds, objects, updateObject]);

  const flipVertical = useCallback(() => {
    for (const id of selectedObjectIds) {
      const obj = objects.find((o) => o.id === id);
      if (!obj) continue;
      const update = computeFlip(obj.attrs as unknown as Record<string, unknown>, "y");
      updateObject(id, update as Partial<typeof obj.attrs>);
    }
  }, [selectedObjectIds, objects, updateObject]);

  return {
    transformerRef,
    isTransforming,
    values,
    lockedAspect,
    setLockedAspect,
    activate,
    applyTransform,
    cancelTransform,
    setValues,
    flipHorizontal,
    flipVertical,
  };
}

// ---------------------------------------------------------------------------
// TransformToolTransformer -- Konva Transformer for free transform mode
// ---------------------------------------------------------------------------

export function TransformToolTransformer({
  transformerRef,
  onTransformEnd,
}: {
  transformerRef: React.RefObject<Konva.Transformer | null>;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
}) {
  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const id = node.id();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newW = Math.max(1, node.width() * scaleX);
      const newH = Math.max(1, node.height() * scaleY);

      // Reset scale on the Konva node
      node.scaleX(1);
      node.scaleY(1);
      node.width(newW);
      node.height(newH);

      // Directly update the store with the new attributes
      if (id) {
        const obj = useEditorStore.getState().objects.find((o) => o.id === id);
        const newAttrs: Record<string, unknown> = {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
        };

        if (obj?.type === "ellipse") {
          // Convert width/height to radiusX/radiusY for ellipses
          newAttrs.radiusX = newW / 2;
          newAttrs.radiusY = newH / 2;
        } else if (obj?.type === "polygon") {
          // Convert width/height to radius for polygons
          newAttrs.radius = (newW + newH) / 4;
        } else if (obj?.type === "star") {
          // Scale outerRadius and innerRadius proportionally for stars
          const starAttrs = obj.attrs as { outerRadius: number; innerRadius: number };
          const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
          newAttrs.outerRadius = starAttrs.outerRadius * avgScale;
          newAttrs.innerRadius = starAttrs.innerRadius * avgScale;
        } else {
          // Rectangles, images, text: use width/height directly
          newAttrs.width = newW;
          newAttrs.height = newH;
        }

        useEditorStore.getState().updateObject(id, newAttrs);
      }

      onTransformEnd?.(e);
    },
    [onTransformEnd],
  );

  return (
    <Transformer
      ref={transformerRef}
      rotateEnabled
      flipEnabled
      keepRatio={false}
      rotationSnaps={[
        0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285,
        300, 315, 330, 345,
      ]}
      anchorSize={8}
      anchorStroke="#E07832"
      anchorFill="#ffffff"
      anchorCornerRadius={2}
      borderStroke="#E07832"
      borderStrokeWidth={1}
      borderDash={[4, 4]}
      padding={0}
      onTransformEnd={handleTransformEnd}
    />
  );
}
