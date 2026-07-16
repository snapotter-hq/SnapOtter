// apps/web/src/stores/editor-store.ts

import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { temporal } from "zundo";
import { create } from "zustand";
import { generateId } from "@/lib/utils";
import type {
  AdjustmentValues,
  CanvasObject,
  EditorLayer,
  EditorState,
  EraserMode,
  FilterConfig,
  SelectionMode,
  StrokeDashStyle,
  ToolType,
} from "@/types/editor";

export function hexToRgba(hex: string, opacity: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function dashStyleToArray(
  style: StrokeDashStyle,
  strokeWidth: number,
): number[] | undefined {
  switch (style) {
    case "dashed":
      return [strokeWidth * 4, strokeWidth * 2];
    case "dotted":
      return [strokeWidth, strokeWidth * 2];
    default:
      return undefined;
  }
}

// Helpers for objects that use points arrays (line, arrow) vs positioned objects
function hasPointsArray(obj: CanvasObject): obj is CanvasObject & { attrs: { points: number[] } } {
  return "points" in obj.attrs && Array.isArray((obj.attrs as { points: number[] }).points);
}

function isCenterBased(obj: CanvasObject): boolean {
  return obj.type === "ellipse" || obj.type === "polygon" || obj.type === "star";
}

// Extended store state with additional fields/methods not yet in the shared interface
interface EditorStateExtensions {
  canvasBackground: string;
  commitHistory: (action: string) => void;
  batchNudge: (objectIds: string[], dx: number, dy: number) => void;
  updateLayerThumbnail: (layerId: string, thumbnailDataUrl: string) => void;
}

const DEFAULT_CANVAS_SIZE = { width: 1920, height: 1080 };
const DEFAULT_LAYER_ID = "layer-1";
const MAX_RECENT_COLORS = 12;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 64;
const MAX_BRUSH_SIZE = 500;
const MAX_HISTORY = 50;

const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  luminance: 0,
  exposure: 0,
  vibrance: 0,
  warmth: 0,
};

const DEFAULT_FILTERS: FilterConfig[] = [
  { type: "blur", enabled: false, params: { radius: 0 } },
  { type: "sharpen", enabled: false, params: { amount: 0 } },
  { type: "noise", enabled: false, params: { amount: 0 } },
  { type: "pixelate", enabled: false, params: { size: 1 } },
  { type: "emboss", enabled: false, params: { strength: 0 } },
  { type: "grayscale", enabled: false, params: {} },
  { type: "sepia", enabled: false, params: {} },
  { type: "invert", enabled: false, params: {} },
  { type: "posterize", enabled: false, params: { levels: 8 } },
  { type: "solarize", enabled: false, params: {} },
  { type: "threshold", enabled: false, params: { level: 0.5 } },
  { type: "kaleidoscope", enabled: false, params: { power: 2, angle: 0 } },
  { type: "motionBlur", enabled: false, params: { angle: 0, distance: 10 } },
  {
    type: "radialBlur",
    enabled: false,
    params: { amount: 10, centerX: 0.5, centerY: 0.5 },
  },
  {
    type: "surfaceBlur",
    enabled: false,
    params: { radius: 5, threshold: 25 },
  },
  {
    type: "vignette",
    enabled: false,
    params: { amount: 50, midpoint: 50, roundness: 0, feather: 50 },
  },
  {
    type: "grain",
    enabled: false,
    params: { amount: 25, size: 25, roughness: 50 },
  },
];

function createDefaultLayer(id: string, name: string): EditorLayer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    thumbnail: null,
  };
}

function nextLayerNumber(layers: EditorLayer[]): number {
  let max = 0;
  for (const l of layers) {
    const m = l.name.match(/^Layer (\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export const useEditorStore = create<EditorState & EditorStateExtensions>()(
  temporal(
    (set, get) => ({
      // --- Canvas ---
      canvasSize: DEFAULT_CANVAS_SIZE,
      zoom: 1,
      panOffset: { x: 0, y: 0 },
      cursorPosition: { x: 0, y: 0 },

      // --- Canvas background (used when canvas is resized larger) ---
      canvasBackground: "#ffffff",

      // --- Image ---
      sourceImageUrl: null,
      sourceImageSize: null,

      // --- Tool ---
      activeTool: "move" as ToolType,
      previousTool: null,

      // --- Brush ---
      brushSize: 10,
      brushOpacity: 1,
      brushHardness: 1,
      brushFlow: 1,
      eraserMode: "brush" as EraserMode,

      // --- Colors ---
      foregroundColor: "#000000",
      backgroundColor: "#ffffff",
      recentColors: [],

      // --- Layers ---
      layers: [createDefaultLayer(DEFAULT_LAYER_ID, "Layer 1")],
      activeLayerId: DEFAULT_LAYER_ID,

      // --- Objects ---
      objects: [],
      selectedObjectIds: [],

      // --- Selection ---
      selection: null,
      selectionMode: "new" as SelectionMode,
      magicWandTolerance: 32,
      magicWandContiguous: true,
      selectionFeather: 0,

      // --- Crop ---
      cropState: null,
      isCropping: false,

      // --- Adjustments ---
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      filters: DEFAULT_FILTERS.map((f) => ({
        ...f,
        params: { ...f.params },
      })),

      // --- Text ---
      editingTextId: null,

      // --- Shape settings ---
      shapeFill: "#E07832" as string | null,
      shapeFillOpacity: 1,
      shapeStroke: "#000000" as string | null,
      shapeStrokeOpacity: 1,
      shapeStrokeWidth: 2,
      shapeStrokeDash: "solid" as const,
      shapeCornerRadius: 0,
      shapePolygonSides: 6,
      shapeStarPoints: 5,

      // --- Clone stamp ---
      cloneSource: null,
      cloneAligned: true,

      // --- Dodge/Burn/Sponge ---
      dodgeBurnRange: "midtones",
      dodgeBurnExposure: 50,
      spongeMode: "saturate",
      spongeFlow: 50,

      // --- Fill tool ---
      fillTolerance: 32,
      fillContiguous: true,

      // --- Gradient tool ---
      gradientType: "linear",
      gradientOpacity: 1,
      gradientReverse: false,

      // --- Pixel brush ---
      pixelBrushStrength: 50,

      // --- UI ---
      rightPanelTab: "layers",
      rightPanelVisible: true,
      isSpaceHeld: false,

      // --- Document ---
      isDirty: false,
      lastAutoSave: null,

      // --- Clipboard ---
      clipboard: null,

      // --- Guides ---
      guides: [],
      snappingEnabled: true,
      rulersVisible: false,
      guidesVisible: true,
      gridVisible: false,

      // --- Loading ---
      loadingState: null,

      // --- History ---
      lastAction: "Initial State",
      _historyVersion: 0,

      // ===== ACTIONS =====

      setTool: (tool) => {
        const { activeTool, canvasSize, cropState } = get();
        if (tool !== activeTool) {
          // Which editor tools users actually engage (brush/shape/adjust/...);
          // the single chokepoint, so UI clicks and keyboard shortcuts both count.
          import("@/lib/analytics").then(({ track }) =>
            track(ANALYTICS_EVENTS.EDITOR_TOOL_USED, { editor_tool: tool }),
          );
        }
        const leavingCrop = activeTool === "crop" && tool !== "crop";
        const enteringCrop = tool === "crop" && activeTool !== "crop";
        set({
          activeTool: tool,
          previousTool: activeTool,
          isCropping: tool === "crop",
          ...(leavingCrop ? { cropState: null } : {}),
          ...(enteringCrop && !cropState
            ? {
                cropState: {
                  x: canvasSize.width * 0.1,
                  y: canvasSize.height * 0.1,
                  width: canvasSize.width * 0.8,
                  height: canvasSize.height * 0.8,
                  aspectRatio: null,
                },
              }
            : {}),
        });
      },

      setCursorPosition: (pos) => set({ cursorPosition: pos }),

      setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

      setPanOffset: (offset) => set({ panOffset: offset }),

      loadImage: (url, width, height) => {
        const oldUrl = get().sourceImageUrl;
        if (oldUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(oldUrl);
        }
        set({
          sourceImageUrl: url,
          sourceImageSize: { width, height },
          canvasSize: { width, height },
          zoom: 1,
          panOffset: { x: 0, y: 0 },
          objects: [],
          selectedObjectIds: [],
          selection: null,
          cropState: null,
          isCropping: false,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          filters: DEFAULT_FILTERS.map((f) => ({
            ...f,
            params: { ...f.params },
          })),
          clipboard: null,
          editingTextId: null,
          layers: [createDefaultLayer(DEFAULT_LAYER_ID, "Layer 1")],
          activeLayerId: DEFAULT_LAYER_ID,
          lastAction: "Load Image",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      resizeCanvas: (width, height, anchor, fill) => {
        const { canvasSize, objects } = get();
        const dw = width - canvasSize.width;
        const dh = height - canvasSize.height;
        let offsetX = 0;
        let offsetY = 0;
        if (anchor === "center") {
          offsetX = dw / 2;
          offsetY = dh / 2;
        } else {
          if (anchor.includes("center")) {
            offsetX = dw / 2;
          } else if (anchor.includes("right")) {
            offsetX = dw;
          }
          if (anchor.startsWith("center")) {
            offsetY = dh / 2;
          } else if (anchor.startsWith("bottom")) {
            offsetY = dh;
          }
        }
        set({
          canvasSize: { width, height },
          ...(fill ? { canvasBackground: fill } : {}),
          objects:
            offsetX !== 0 || offsetY !== 0
              ? objects.map((obj) => {
                  const attrs = { ...obj.attrs };
                  if (hasPointsArray(obj)) {
                    const pts = [...(attrs as { points: number[] }).points];
                    for (let i = 0; i < pts.length; i += 2) {
                      pts[i] += offsetX;
                      pts[i + 1] += offsetY;
                    }
                    (attrs as { points: number[] }).points = pts;
                  } else {
                    if ("x" in attrs) {
                      (attrs as { x: number }).x += offsetX;
                    }
                    if ("y" in attrs) {
                      (attrs as { y: number }).y += offsetY;
                    }
                  }
                  return { ...obj, attrs } as CanvasObject;
                })
              : objects,
          isDirty: true,
          lastAction: "Resize Canvas",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      resizeImage: (width, height, resample) => {
        void resample; // accepted for future server-side resize; client-side scales objects only
        const { canvasSize, objects } = get();
        const scaleX = width / canvasSize.width;
        const scaleY = height / canvasSize.height;
        set({
          canvasSize: { width, height },
          sourceImageSize: { width, height },
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            const a = attrs as unknown as Record<string, number>;
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                pts[i] *= scaleX;
                pts[i + 1] *= scaleY;
              }
              (attrs as { points: number[] }).points = pts;
              if ("strokeWidth" in attrs) a.strokeWidth *= Math.min(scaleX, scaleY);
            } else {
              if ("x" in attrs) a.x *= scaleX;
              if ("y" in attrs) a.y *= scaleY;
              if ("width" in attrs) a.width *= scaleX;
              if ("height" in attrs) a.height *= scaleY;
              if ("radius" in attrs) a.radius *= Math.min(scaleX, scaleY);
              if ("radiusX" in attrs) a.radiusX *= scaleX;
              if ("radiusY" in attrs) a.radiusY *= scaleY;
              if ("innerRadius" in attrs) a.innerRadius *= Math.min(scaleX, scaleY);
              if ("outerRadius" in attrs) a.outerRadius *= Math.min(scaleX, scaleY);
              if ("fontSize" in attrs) a.fontSize *= Math.min(scaleX, scaleY);
              if ("strokeWidth" in attrs) a.strokeWidth *= Math.min(scaleX, scaleY);
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: "Resize Image",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      rotateCanvas: (degrees) => {
        const { canvasSize, objects } = get();
        const newSize =
          degrees === 180 ? canvasSize : { width: canvasSize.height, height: canvasSize.width };
        set({
          canvasSize: newSize,
          sourceImageSize: newSize,
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            const a = attrs as unknown as Record<string, number>;

            // Handle points-based objects (line, arrow)
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                const px = pts[i];
                const py = pts[i + 1];
                if (degrees === 90) {
                  pts[i] = canvasSize.height - py;
                  pts[i + 1] = px;
                } else if (degrees === 270) {
                  pts[i] = py;
                  pts[i + 1] = canvasSize.width - px;
                } else {
                  pts[i] = canvasSize.width - px;
                  pts[i + 1] = canvasSize.height - py;
                }
              }
              (attrs as { points: number[] }).points = pts;
            } else {
              const centerBased = isCenterBased(obj);
              const hasPos = "x" in attrs && "y" in attrs;
              const hasSize = "width" in attrs && "height" in attrs;

              if (hasPos) {
                if (degrees === 90) {
                  const newX = canvasSize.height - a.y - (centerBased ? 0 : hasSize ? a.height : 0);
                  const newY = a.x;
                  a.x = newX;
                  a.y = newY;
                } else if (degrees === 270) {
                  const newX = a.y;
                  const newY = canvasSize.width - a.x - (centerBased ? 0 : hasSize ? a.width : 0);
                  a.x = newX;
                  a.y = newY;
                } else {
                  a.x = canvasSize.width - a.x - (centerBased ? 0 : hasSize ? a.width : 0);
                  a.y = canvasSize.height - a.y - (centerBased ? 0 : hasSize ? a.height : 0);
                }
              }
              if (hasSize && degrees !== 180) {
                const oldW = a.width;
                a.width = a.height;
                a.height = oldW;
              }
              if ("radiusX" in attrs && "radiusY" in attrs && degrees !== 180) {
                const oldRx = a.radiusX;
                a.radiusX = a.radiusY;
                a.radiusY = oldRx;
              }
            }
            if ("rotation" in attrs) {
              a.rotation = ((a.rotation || 0) + degrees) % 360;
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: `Rotate Canvas ${degrees}`,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      flipCanvasHorizontal: () => {
        const { canvasSize, objects } = get();
        set({
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            const a = attrs as unknown as Record<string, number>;
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                pts[i] = canvasSize.width - pts[i];
              }
              (attrs as { points: number[] }).points = pts;
            } else if ("x" in attrs) {
              const centerBased = isCenterBased(obj);
              const w = centerBased ? 0 : "width" in attrs ? a.width : 0;
              a.x = canvasSize.width - a.x - w;
            }
            if ("rotation" in attrs) {
              a.rotation = (360 - (a.rotation || 0)) % 360;
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: "Flip Horizontal",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      flipCanvasVertical: () => {
        const { canvasSize, objects } = get();
        set({
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            const a = attrs as unknown as Record<string, number>;
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 1; i < pts.length; i += 2) {
                pts[i] = canvasSize.height - pts[i];
              }
              (attrs as { points: number[] }).points = pts;
            } else if ("y" in attrs) {
              const centerBased = isCenterBased(obj);
              const h = centerBased ? 0 : "height" in attrs ? a.height : 0;
              a.y = canvasSize.height - a.y - h;
            }
            if ("rotation" in attrs) {
              a.rotation = (360 - (a.rotation || 0)) % 360;
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: "Flip Vertical",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      trimCanvas: () => {
        const { objects, canvasSize } = get();
        if (objects.length === 0) return;
        let minX = canvasSize.width;
        let minY = canvasSize.height;
        let maxX = 0;
        let maxY = 0;
        for (const obj of objects) {
          const a = obj.attrs as unknown as Record<string, number>;
          const sw = "strokeWidth" in obj.attrs ? a.strokeWidth / 2 : 0;
          if (hasPointsArray(obj)) {
            const pts = (obj.attrs as { points: number[] }).points;
            for (let i = 0; i < pts.length; i += 2) {
              minX = Math.min(minX, pts[i] - sw);
              minY = Math.min(minY, pts[i + 1] - sw);
              maxX = Math.max(maxX, pts[i] + sw);
              maxY = Math.max(maxY, pts[i + 1] + sw);
            }
          } else if (isCenterBased(obj)) {
            const cx = "x" in obj.attrs ? a.x : 0;
            const cy = "y" in obj.attrs ? a.y : 0;
            const rx =
              "radiusX" in obj.attrs
                ? a.radiusX
                : "radius" in obj.attrs
                  ? a.radius
                  : "outerRadius" in obj.attrs
                    ? a.outerRadius
                    : 0;
            const ry =
              "radiusY" in obj.attrs
                ? a.radiusY
                : "radius" in obj.attrs
                  ? a.radius
                  : "outerRadius" in obj.attrs
                    ? a.outerRadius
                    : 0;
            minX = Math.min(minX, cx - rx - sw);
            minY = Math.min(minY, cy - ry - sw);
            maxX = Math.max(maxX, cx + rx + sw);
            maxY = Math.max(maxY, cy + ry + sw);
          } else {
            const x = "x" in obj.attrs ? a.x : 0;
            const y = "y" in obj.attrs ? a.y : 0;
            const w = "width" in obj.attrs ? a.width : 0;
            const h = "height" in obj.attrs ? a.height : 0;
            minX = Math.min(minX, x - sw);
            minY = Math.min(minY, y - sw);
            maxX = Math.max(maxX, x + w + sw);
            maxY = Math.max(maxY, y + h + sw);
          }
        }
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(canvasSize.width, Math.ceil(maxX));
        maxY = Math.min(canvasSize.height, Math.ceil(maxY));
        const newWidth = maxX - minX;
        const newHeight = maxY - minY;
        if (newWidth <= 0 || newHeight <= 0) return;
        if (
          newWidth === canvasSize.width &&
          newHeight === canvasSize.height &&
          minX === 0 &&
          minY === 0
        )
          return;
        set({
          canvasSize: { width: newWidth, height: newHeight },
          sourceImageSize: { width: newWidth, height: newHeight },
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                pts[i] -= minX;
                pts[i + 1] -= minY;
              }
              (attrs as { points: number[] }).points = pts;
            } else {
              if ("x" in attrs) {
                (attrs as unknown as Record<string, number>).x -= minX;
              }
              if ("y" in attrs) {
                (attrs as unknown as Record<string, number>).y -= minY;
              }
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: "Trim Canvas",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Colors
      setForegroundColor: (color) => {
        const { recentColors } = get();
        const updated = [color, ...recentColors.filter((c) => c !== color)].slice(
          0,
          MAX_RECENT_COLORS,
        );
        set({ foregroundColor: color, recentColors: updated });
      },

      setBackgroundColor: (color) => {
        const { recentColors } = get();
        const updated = [color, ...recentColors.filter((c) => c !== color)].slice(
          0,
          MAX_RECENT_COLORS,
        );
        set({ backgroundColor: color, recentColors: updated });
      },

      swapColors: () => {
        const { foregroundColor, backgroundColor } = get();
        set({
          foregroundColor: backgroundColor,
          backgroundColor: foregroundColor,
        });
      },

      resetColors: () => set({ foregroundColor: "#000000", backgroundColor: "#ffffff" }),

      // Objects
      addObject: (obj) => {
        set({
          objects: [...get().objects, { ...obj, layerId: obj.layerId || get().activeLayerId }],
          isDirty: true,
          lastAction: `Add ${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)}`,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Issue #11: Don't increment _historyVersion here -- updateObject is called
      // on every mousemove during brush strokes for live preview. History is only
      // recorded when addObject finalizes the stroke.
      updateObject: (id, attrs) => {
        set({
          objects: get().objects.map((obj) =>
            obj.id === id ? ({ ...obj, attrs: { ...obj.attrs, ...attrs } } as CanvasObject) : obj,
          ),
          isDirty: true,
        });
      },

      // Layer effects (drop shadow, glows, etc.) live on the object's top-level
      // `effects` field, NOT in `attrs`, so they need their own setter. Routing
      // them through updateObject would nest them under `attrs.effects`, where
      // nothing reads them, so the effect would silently never apply.
      setObjectEffects: (id, effects) => {
        set({
          objects: get().objects.map((obj) => (obj.id === id ? { ...obj, effects } : obj)),
          isDirty: true,
          lastAction: "Layer Effect",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      removeObjects: (ids) => {
        const idSet = new Set(ids);
        set({
          objects: get().objects.filter((obj) => !idSet.has(obj.id)),
          selectedObjectIds: get().selectedObjectIds.filter((id) => !idSet.has(id)),
          isDirty: true,
          lastAction: "Delete",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      setSelectedObjects: (ids) => set({ selectedObjectIds: ids }),

      bringToFront: (objectId) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj) return;
        const newObjects = objects.filter((o) => o.id !== objectId);
        let insertIdx = newObjects.length;
        for (let i = newObjects.length - 1; i >= 0; i--) {
          if (newObjects[i].layerId === obj.layerId) {
            insertIdx = i + 1;
            break;
          }
        }
        newObjects.splice(insertIdx, 0, obj);
        set({
          objects: newObjects,
          lastAction: "Bring to Front",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      bringForward: (objectId) => {
        const { objects } = get();
        const idx = objects.findIndex((o) => o.id === objectId);
        if (idx === -1) return;
        const obj = objects[idx];
        let swapIdx = -1;
        for (let i = idx + 1; i < objects.length; i++) {
          if (objects[i].layerId === obj.layerId) {
            swapIdx = i;
            break;
          }
        }
        if (swapIdx === -1) return;
        const newObjects = [...objects];
        [newObjects[idx], newObjects[swapIdx]] = [newObjects[swapIdx], newObjects[idx]];
        set({
          objects: newObjects,
          lastAction: "Bring Forward",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      sendBackward: (objectId) => {
        const { objects } = get();
        const idx = objects.findIndex((o) => o.id === objectId);
        if (idx === -1) return;
        const obj = objects[idx];
        let swapIdx = -1;
        for (let i = idx - 1; i >= 0; i--) {
          if (objects[i].layerId === obj.layerId) {
            swapIdx = i;
            break;
          }
        }
        if (swapIdx === -1) return;
        const newObjects = [...objects];
        [newObjects[swapIdx], newObjects[idx]] = [newObjects[idx], newObjects[swapIdx]];
        set({
          objects: newObjects,
          lastAction: "Send Backward",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      sendToBack: (objectId) => {
        const { objects, layers } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj) return;
        const newObjects = objects.filter((o) => o.id !== objectId);
        // Find the first object on the same layer
        let insertIdx = -1;
        for (let i = 0; i < newObjects.length; i++) {
          if (newObjects[i].layerId === obj.layerId) {
            insertIdx = i;
            break;
          }
        }
        // If no other objects on the same layer, find the correct position
        // based on layer ordering (after all objects from earlier layers)
        if (insertIdx === -1) {
          const layerIdx = layers.findIndex((l) => l.id === obj.layerId);
          insertIdx = 0;
          for (let i = 0; i < newObjects.length; i++) {
            const objLayerIdx = layers.findIndex((l) => l.id === newObjects[i].layerId);
            if (objLayerIdx < layerIdx) {
              insertIdx = i + 1;
            }
          }
        }
        newObjects.splice(insertIdx, 0, obj);
        set({
          objects: newObjects,
          lastAction: "Send to Back",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Layers
      addLayer: () => {
        const id = generateId();
        const name = `Layer ${nextLayerNumber(get().layers)}`;
        const newLayer = createDefaultLayer(id, name);
        const { layers, activeLayerId } = get();
        const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
        const newLayers = [...layers];
        newLayers.splice(activeIndex + 1, 0, newLayer);
        set({
          layers: newLayers,
          activeLayerId: id,
          isDirty: true,
          lastAction: "Add Layer",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      removeLayer: (id) => {
        const { layers, objects, activeLayerId } = get();
        if (layers.length <= 1) return;
        const idx = layers.findIndex((l) => l.id === id);
        const newLayers = layers.filter((l) => l.id !== id);
        const newActiveId =
          activeLayerId === id ? newLayers[Math.min(idx, newLayers.length - 1)].id : activeLayerId;
        set({
          layers: newLayers,
          objects: objects.filter((o) => o.layerId !== id),
          activeLayerId: newActiveId,
          isDirty: true,
          lastAction: "Delete Layer",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      duplicateLayer: (id) => {
        const { layers, objects } = get();
        const source = layers.find((l) => l.id === id);
        if (!source) return;
        const newId = generateId();
        const copy: EditorLayer = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          thumbnail: null,
        };
        const sourceObjects = objects
          .filter((o) => o.layerId === id)
          .map((o) => ({ ...o, id: generateId(), layerId: newId }) as CanvasObject);
        const idx = layers.findIndex((l) => l.id === id);
        const newLayers = [...layers];
        newLayers.splice(idx + 1, 0, copy);
        set({
          layers: newLayers,
          objects: [...objects, ...sourceObjects],
          activeLayerId: newId,
          isDirty: true,
          lastAction: "Duplicate Layer",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      setActiveLayer: (id) => set({ activeLayerId: id }),

      updateLayer: (id, updates) => {
        set({
          layers: get().layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
          isDirty: true,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      reorderLayers: (fromIndex, toIndex) => {
        const newLayers = [...get().layers];
        const [moved] = newLayers.splice(fromIndex, 1);
        newLayers.splice(toIndex, 0, moved);
        set({
          layers: newLayers,
          isDirty: true,
          lastAction: "Reorder Layers",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      mergeDown: (id) => {
        const { layers, objects } = get();
        const idx = layers.findIndex((l) => l.id === id);
        if (idx <= 0) return;
        const belowLayer = layers[idx - 1];
        const mergedObjects = objects.map((o) =>
          o.layerId === id ? ({ ...o, layerId: belowLayer.id } as CanvasObject) : o,
        );
        set({
          layers: layers.filter((l) => l.id !== id),
          objects: mergedObjects,
          activeLayerId: belowLayer.id,
          isDirty: true,
          lastAction: "Merge Down",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      flattenAll: () => {
        const { layers, objects } = get();
        const bottomLayer = layers[0];
        set({
          layers: [{ ...bottomLayer, name: "Flattened" }],
          objects: objects.map((o) => ({ ...o, layerId: bottomLayer.id }) as CanvasObject),
          activeLayerId: bottomLayer.id,
          isDirty: true,
          lastAction: "Flatten All",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Adjustments
      // Issue #7: Include _historyVersion increment for undo tracking
      setAdjustment: (key, value) => {
        const clamps: Record<string, [number, number]> = {
          brightness: [-100, 100],
          contrast: [-100, 100],
          hue: [0, 359],
          saturation: [-100, 100],
          luminance: [-100, 100],
          exposure: [-100, 100],
          vibrance: [-100, 100],
          warmth: [-100, 100],
        };
        const [min, max] = clamps[key] || [-100, 100];
        set({
          adjustments: {
            ...get().adjustments,
            [key]: Math.max(min, Math.min(max, value)),
          },
          isDirty: true,
          lastAction: `Adjust ${key.charAt(0).toUpperCase() + key.slice(1)}`,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      resetAdjustments: () =>
        set({
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          isDirty: true,
          lastAction: "Reset Adjustments",
          _historyVersion: get()._historyVersion + 1,
        }),

      toggleFilter: (type) => {
        set({
          filters: get().filters.map((f) => (f.type === type ? { ...f, enabled: !f.enabled } : f)),
          isDirty: true,
          lastAction: `Toggle ${type.charAt(0).toUpperCase() + type.slice(1)} Filter`,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      setFilterParam: (type, key, value) => {
        set({
          filters: get().filters.map((f) =>
            f.type === type ? { ...f, params: { ...f.params, [key]: value } } : f,
          ),
          isDirty: true,
          lastAction: `Set ${type} ${key}`,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Selection
      setSelection: (selection) => set({ selection }),
      setSelectionMode: (mode) => set({ selectionMode: mode }),
      setMagicWandTolerance: (v) => set({ magicWandTolerance: v }),
      setMagicWandContiguous: (v: boolean) => set({ magicWandContiguous: v }),
      setSelectionFeather: (v) => set({ selectionFeather: v }),

      invertSelection: () => {
        const { selection, canvasSize } = get();
        if (!selection) return;
        const oldBounds = selection.bounds;
        const oldMask = selection.mask;

        const fullW = canvasSize.width;
        const fullH = canvasSize.height;
        const inverted = new Uint8Array(fullW * fullH);

        if (oldMask) {
          // Start with everything selected
          inverted.fill(1);
          // Clear pixels that were selected in the old mask
          for (let row = 0; row < oldBounds.height; row++) {
            for (let col = 0; col < oldBounds.width; col++) {
              if (oldMask[row * oldBounds.width + col]) {
                const absY = oldBounds.y + row;
                const absX = oldBounds.x + col;
                if (absX >= 0 && absX < fullW && absY >= 0 && absY < fullH) {
                  inverted[absY * fullW + absX] = 0;
                }
              }
            }
          }
        } else {
          // Geometric selection (rect/ellipse): invert by marking everything
          // outside the bounds as selected
          inverted.fill(1);
          const x0 = Math.max(0, Math.floor(oldBounds.x));
          const y0 = Math.max(0, Math.floor(oldBounds.y));
          const x1 = Math.min(fullW, Math.ceil(oldBounds.x + oldBounds.width));
          const y1 = Math.min(fullH, Math.ceil(oldBounds.y + oldBounds.height));
          for (let row = y0; row < y1; row++) {
            for (let col = x0; col < x1; col++) {
              inverted[row * fullW + col] = 0;
            }
          }
        }

        set({
          selection: {
            ...selection,
            type: "wand",
            bounds: { x: 0, y: 0, width: fullW, height: fullH },
            mask: inverted,
          },
        });
      },

      // Crop
      setCropState: (state) => set({ cropState: state, isCropping: state !== null }),

      applyCrop: () => {
        const { cropState, objects, sourceImageUrl } = get();
        if (!cropState) return;

        // Crop the source image via an offscreen canvas
        if (sourceImageUrl) {
          const img = new Image();
          img.onload = () => {
            const offscreen = document.createElement("canvas");
            offscreen.width = cropState.width;
            offscreen.height = cropState.height;
            const ctx = offscreen.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, -cropState.x, -cropState.y);
              const croppedUrl = offscreen.toDataURL("image/png");
              const oldUrl = get().sourceImageUrl;
              if (oldUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(oldUrl);
              }
              set({ sourceImageUrl: croppedUrl });
            }
          };
          img.src = sourceImageUrl;
        }

        set({
          canvasSize: { width: cropState.width, height: cropState.height },
          sourceImageSize: { width: cropState.width, height: cropState.height },
          objects: objects.map((obj) => {
            const attrs = { ...obj.attrs };
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                pts[i] -= cropState.x;
                pts[i + 1] -= cropState.y;
              }
              (attrs as { points: number[] }).points = pts;
            } else {
              if ("x" in attrs) {
                (attrs as { x: number }).x -= cropState.x;
              }
              if ("y" in attrs) {
                (attrs as { y: number }).y -= cropState.y;
              }
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          cropState: null,
          isCropping: false,
          isDirty: true,
          lastAction: "Crop",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Brush
      setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(MAX_BRUSH_SIZE, size)) }),
      setBrushOpacity: (opacity) => set({ brushOpacity: Math.max(0, Math.min(1, opacity)) }),
      setBrushHardness: (hardness) => set({ brushHardness: Math.max(0, Math.min(1, hardness)) }),
      setBrushFlow: (flow) => set({ brushFlow: Math.max(0, Math.min(1, flow)) }),
      setEraserMode: (mode) => set({ eraserMode: mode }),

      // Clipboard
      copyObjects: () => {
        const { objects, selectedObjectIds } = get();
        const selected = objects.filter((o) => selectedObjectIds.includes(o.id));
        set({ clipboard: selected });
      },

      cutObjects: () => {
        const state = get();
        const selected = state.objects.filter((o) => state.selectedObjectIds.includes(o.id));
        if (!selected.length) return;
        const idSet = new Set(state.selectedObjectIds);
        set({
          clipboard: selected,
          objects: state.objects.filter((o) => !idSet.has(o.id)),
          selectedObjectIds: [],
          isDirty: true,
          lastAction: "Cut",
          _historyVersion: state._historyVersion + 1,
        });
      },

      pasteObjects: () => {
        const { clipboard, activeLayerId } = get();
        if (!clipboard || clipboard.length === 0) return;
        const pasted = clipboard.map(
          (obj) =>
            ({
              ...obj,
              id: generateId(),
              layerId: activeLayerId,
              attrs: {
                ...obj.attrs,
                ...("x" in obj.attrs ? { x: (obj.attrs as { x: number }).x + 10 } : {}),
                ...("y" in obj.attrs ? { y: (obj.attrs as { y: number }).y + 10 } : {}),
              },
            }) as CanvasObject,
        );
        set({
          objects: [...get().objects, ...pasted],
          selectedObjectIds: pasted.map((o) => o.id),
          isDirty: true,
          lastAction: "Paste",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      pasteInPlace: () => {
        const { clipboard, activeLayerId } = get();
        if (!clipboard || clipboard.length === 0) return;
        const pasted = clipboard.map(
          (obj) =>
            ({
              ...obj,
              id: generateId(),
              layerId: activeLayerId,
            }) as CanvasObject,
        );
        set({
          objects: [...get().objects, ...pasted],
          selectedObjectIds: pasted.map((o) => o.id),
          isDirty: true,
          lastAction: "Paste in Place",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Guides
      addGuide: (orientation, position) => {
        set({
          guides: [...get().guides, { id: generateId(), orientation, position }],
        });
      },

      removeGuide: (id) => {
        set({ guides: get().guides.filter((g) => g.id !== id) });
      },

      updateGuide: (id, position) => {
        set({
          guides: get().guides.map((g) => (g.id === id ? { ...g, position } : g)),
        });
      },

      toggleSnapping: () => set({ snappingEnabled: !get().snappingEnabled }),
      toggleRulers: () => set({ rulersVisible: !get().rulersVisible }),
      toggleGuides: () => set({ guidesVisible: !get().guidesVisible }),
      toggleGrid: () => set({ gridVisible: !get().gridVisible }),

      // Document
      markDirty: () => set({ isDirty: true }),
      markClean: () => set({ isDirty: false }),
      setLoadingState: (state) => set({ loadingState: state }),

      // Text
      setEditingTextId: (id) => set({ editingTextId: id }),

      // Dodge/Burn/Sponge settings
      setDodgeBurnRange: (range) => set({ dodgeBurnRange: range }),
      setDodgeBurnExposure: (exposure) => set({ dodgeBurnExposure: exposure }),
      setSpongeMode: (mode) => set({ spongeMode: mode }),
      setSpongeFlow: (flow) => set({ spongeFlow: flow }),

      // Shape settings
      setShapeFill: (fill) => set({ shapeFill: fill }),
      setShapeFillOpacity: (opacity) =>
        set({ shapeFillOpacity: Math.max(0, Math.min(1, opacity)) }),
      setShapeStroke: (stroke) => set({ shapeStroke: stroke }),
      setShapeStrokeOpacity: (opacity) =>
        set({ shapeStrokeOpacity: Math.max(0, Math.min(1, opacity)) }),
      setShapeStrokeWidth: (width) => set({ shapeStrokeWidth: width }),
      setShapeStrokeDash: (dash) => set({ shapeStrokeDash: dash }),
      setShapeCornerRadius: (radius) => set({ shapeCornerRadius: radius }),
      setShapePolygonSides: (sides) => set({ shapePolygonSides: sides }),
      setShapeStarPoints: (points) => set({ shapeStarPoints: points }),

      // Clone stamp
      setCloneSource: (source) => set({ cloneSource: source }),
      setCloneAligned: (aligned) => set({ cloneAligned: aligned }),

      // Fill tool settings
      setFillTolerance: (tolerance) =>
        set({ fillTolerance: Math.max(0, Math.min(255, tolerance)) }),
      setFillContiguous: (contiguous) => set({ fillContiguous: contiguous }),

      // Gradient tool settings
      setGradientType: (type) => set({ gradientType: type }),
      setGradientOpacity: (opacity) => set({ gradientOpacity: Math.max(0, Math.min(1, opacity)) }),
      setGradientReverse: (reverse) => set({ gradientReverse: reverse }),

      // Pixel brush settings
      setPixelBrushStrength: (strength) =>
        set({ pixelBrushStrength: Math.max(1, Math.min(100, strength)) }),

      // History commit (for operations like nudge that use updateObject
      // but still need an undo point)
      commitHistory: (action) => {
        set({
          lastAction: action,
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Batch nudge: move multiple objects and create a history entry
      batchNudge: (objectIds, dx, dy) => {
        const idSet = new Set(objectIds);
        set({
          objects: get().objects.map((obj) => {
            if (!idSet.has(obj.id)) return obj;
            const attrs = { ...obj.attrs };
            if (hasPointsArray(obj)) {
              const pts = [...(attrs as { points: number[] }).points];
              for (let i = 0; i < pts.length; i += 2) {
                pts[i] += dx;
                pts[i + 1] += dy;
              }
              (attrs as { points: number[] }).points = pts;
            } else {
              if ("x" in attrs) {
                (attrs as unknown as Record<string, number>).x += dx;
              }
              if ("y" in attrs) {
                (attrs as unknown as Record<string, number>).y += dy;
              }
            }
            return { ...obj, attrs } as CanvasObject;
          }),
          isDirty: true,
          lastAction: "Nudge",
          _historyVersion: get()._historyVersion + 1,
        });
      },

      // Layer thumbnail update (actual generation happens in the canvas component)
      updateLayerThumbnail: (layerId, thumbnailDataUrl) => {
        set({
          layers: get().layers.map((l) =>
            l.id === layerId ? { ...l, thumbnail: thumbnailDataUrl } : l,
          ),
        });
      },

      // Right panel
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      toggleRightPanel: () => set({ rightPanelVisible: !get().rightPanelVisible }),
    }),
    {
      // Issue #8: Include lastAction in partialize so history labels work
      partialize: (state) => ({
        layers: state.layers,
        objects: state.objects,
        canvasSize: state.canvasSize,
        adjustments: state.adjustments,
        filters: state.filters,
        guides: state.guides,
        sourceImageUrl: state.sourceImageUrl,
        sourceImageSize: state.sourceImageSize,
        lastAction: state.lastAction,
        _historyVersion: state._historyVersion,
      }),
      limit: MAX_HISTORY,
      equality: (a, b) =>
        (a as { _historyVersion: number })._historyVersion ===
        (b as { _historyVersion: number })._historyVersion,
      // Issue #1: Forward all arguments from zundo's internal _handleSet.
      // No debounce -- the equality function (based on _historyVersion) already
      // prevents intermediate states from being recorded.  Debouncing caused
      // undo/redo to race with the delayed recording and silently discard the
      // future-states stack.
    },
  ),
);
