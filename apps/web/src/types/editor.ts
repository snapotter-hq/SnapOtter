// apps/web/src/types/editor.ts

export type EraserMode = "brush" | "block";

export type SelectionMode = "new" | "add" | "subtract";

export type StrokeDashStyle = "solid" | "dashed" | "dotted";

export type ToolType =
  | "move"
  | "marquee-rect"
  | "marquee-ellipse"
  | "lasso-free"
  | "lasso-poly"
  | "magic-wand"
  | "crop"
  | "eyedropper"
  | "brush"
  | "eraser"
  | "pencil"
  | "clone-stamp"
  | "dodge"
  | "burn"
  | "sponge"
  | "blur-brush"
  | "sharpen-brush"
  | "smudge"
  | "fill"
  | "gradient"
  | "shape-rect"
  | "shape-ellipse"
  | "shape-line"
  | "shape-arrow"
  | "shape-polygon"
  | "shape-star"
  | "text"
  | "hand"
  | "zoom"
  | "transform";

export interface LineAttrs {
  points: number[];
  stroke?: string;
  strokeWidth: number;
  tension: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "bevel" | "round" | "miter";
  dash?: number[];
  opacity: number;
  globalCompositeOperation: string;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface RectAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  cornerRadius: number;
  dash?: number[];
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export interface EllipseAttrs {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  dash?: number[];
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export interface TextAttrs {
  x: number;
  y: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontVariant: string;
  textDecoration: string;
  align: "left" | "center" | "right";
  fill: string;
  lineHeight: number;
  letterSpacing: number;
  width?: number;
  height?: number;
  wrap?: "word" | "char" | "none";
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export interface ImageAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
  src: string;
}

export interface ArrowAttrs {
  points: number[];
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  pointerLength: number;
  pointerWidth: number;
  dash?: number[];
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export interface PolygonAttrs {
  x: number;
  y: number;
  sides: number;
  radius: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  dash?: number[];
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export interface StarAttrs {
  x: number;
  y: number;
  numPoints: number;
  innerRadius: number;
  outerRadius: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  dash?: number[];
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  opacity: number;
}

export type CanvasObject =
  | { id: string; type: "line"; layerId: string; attrs: LineAttrs; effects?: ObjectEffects }
  | { id: string; type: "rect"; layerId: string; attrs: RectAttrs; effects?: ObjectEffects }
  | { id: string; type: "ellipse"; layerId: string; attrs: EllipseAttrs; effects?: ObjectEffects }
  | { id: string; type: "text"; layerId: string; attrs: TextAttrs; effects?: ObjectEffects }
  | { id: string; type: "image"; layerId: string; attrs: ImageAttrs; effects?: ObjectEffects }
  | { id: string; type: "arrow"; layerId: string; attrs: ArrowAttrs; effects?: ObjectEffects }
  | { id: string; type: "polygon"; layerId: string; attrs: PolygonAttrs; effects?: ObjectEffects }
  | { id: string; type: "star"; layerId: string; attrs: StarAttrs; effects?: ObjectEffects };

export interface ObjectEffects {
  dropShadow?: {
    enabled: boolean;
    color: string;
    opacity: number;
    angle: number;
    distance: number;
    blur: number;
    spread: number;
  };
  innerShadow?: {
    enabled: boolean;
    color: string;
    opacity: number;
    angle: number;
    distance: number;
    blur: number;
  };
  outerGlow?: {
    enabled: boolean;
    color: string;
    opacity: number;
    blur: number;
    spread: number;
  };
  stroke?: {
    enabled: boolean;
    color: string;
    width: number;
    position: "inside" | "center" | "outside";
  };
}

export interface EditorLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  thumbnail: string | null;
}

export interface SelectionState {
  type: "rect" | "ellipse" | "lasso" | "wand";
  points: number[];
  bounds: { x: number; y: number; width: number; height: number };
  mask?: Uint8Array;
}

export interface CropState {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: string | null;
}

export interface AdjustmentValues {
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
  luminance: number;
  exposure: number;
  vibrance: number;
  warmth: number;
}

export interface FilterConfig {
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface Guide {
  id: string;
  orientation: "horizontal" | "vertical";
  position: number;
}

export type AnchorPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface LoadingState {
  operation: string;
  progress: number | null;
  cancellable: boolean;
}

export interface CloneSource {
  x: number;
  y: number;
  aligned: boolean;
}

export interface EditorState {
  // Canvas
  canvasSize: { width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
  cursorPosition: { x: number; y: number };

  // Image
  sourceImageUrl: string | null;
  sourceImageSize: { width: number; height: number } | null;

  // Active tool
  activeTool: ToolType;
  previousTool: ToolType | null;

  // Brush/Eraser settings
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
  brushFlow: number;
  eraserMode: EraserMode;

  // Colors
  foregroundColor: string;
  backgroundColor: string;
  recentColors: string[];

  // Layers
  layers: EditorLayer[];
  activeLayerId: string;

  // Objects
  objects: CanvasObject[];
  selectedObjectIds: string[];

  // Selection
  selection: SelectionState | null;
  selectionMode: SelectionMode;
  magicWandTolerance: number;
  magicWandContiguous: boolean;

  // Crop
  cropState: CropState | null;
  isCropping: boolean;

  // Adjustments & Filters
  adjustments: AdjustmentValues;
  filters: FilterConfig[];

  // Text
  editingTextId: string | null;

  // Shape settings
  shapeFill: string | null;
  shapeFillOpacity: number;
  shapeStroke: string | null;
  shapeStrokeOpacity: number;
  shapeStrokeWidth: number;
  shapeStrokeDash: StrokeDashStyle;
  shapeCornerRadius: number;
  shapePolygonSides: number;
  shapeStarPoints: number;

  // Clone stamp
  cloneSource: CloneSource | null;
  cloneAligned: boolean;

  // Dodge/Burn/Sponge
  dodgeBurnRange: "shadows" | "midtones" | "highlights";
  dodgeBurnExposure: number;
  spongeMode: "saturate" | "desaturate";
  spongeFlow: number;

  // Fill tool
  fillTolerance: number;
  fillContiguous: boolean;

  // Gradient tool
  gradientType: "linear" | "radial";
  gradientOpacity: number;
  gradientReverse: boolean;

  // Pixel brush
  pixelBrushStrength: number;

  // UI
  rightPanelTab: "layers" | "adjustments" | "history";
  rightPanelVisible: boolean;
  isSpaceHeld: boolean;

  // Document state
  isDirty: boolean;
  lastAutoSave: number | null;

  // Clipboard
  clipboard: CanvasObject[] | null;

  // Guides
  guides: Guide[];
  snappingEnabled: boolean;
  rulersVisible: boolean;
  guidesVisible: boolean;
  gridVisible: boolean;

  // Loading
  loadingState: LoadingState | null;

  // History tracking
  lastAction: string;
  _historyVersion: number;

  // --- Actions ---

  // Tool
  setTool: (tool: ToolType) => void;
  setCursorPosition: (pos: { x: number; y: number }) => void;

  // Canvas
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  loadImage: (url: string, width: number, height: number) => void;
  resizeCanvas: (width: number, height: number, anchor: AnchorPosition, fill?: string) => void;
  resizeImage: (width: number, height: number, resample?: string) => void;
  rotateCanvas: (degrees: 90 | 180 | 270) => void;
  flipCanvasHorizontal: () => void;
  flipCanvasVertical: () => void;
  trimCanvas: () => void;

  // Colors
  setForegroundColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  swapColors: () => void;
  resetColors: () => void;

  // Objects
  addObject: (obj: CanvasObject) => void;
  updateObject: (id: string, attrs: Partial<CanvasObject["attrs"]>) => void;
  setObjectEffects: (id: string, effects: ObjectEffects) => void;
  removeObjects: (ids: string[]) => void;
  setSelectedObjects: (ids: string[]) => void;
  bringToFront: (objectId: string) => void;
  bringForward: (objectId: string) => void;
  sendBackward: (objectId: string) => void;
  sendToBack: (objectId: string) => void;

  // Layers
  addLayer: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<EditorLayer>) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  mergeDown: (id: string) => void;
  flattenAll: () => void;

  // Adjustments & Filters
  setAdjustment: (key: keyof AdjustmentValues, value: number) => void;
  resetAdjustments: () => void;
  toggleFilter: (type: string) => void;
  setFilterParam: (type: string, key: string, value: number) => void;

  // Selection
  setSelection: (selection: SelectionState | null) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setMagicWandTolerance: (v: number) => void;
  setMagicWandContiguous: (v: boolean) => void;
  invertSelection: () => void;

  // Crop
  setCropState: (state: CropState | null) => void;
  applyCrop: () => void;

  // Brush
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushHardness: (hardness: number) => void;
  setBrushFlow: (flow: number) => void;
  setEraserMode: (mode: EraserMode) => void;

  // Clipboard
  copyObjects: () => void;
  cutObjects: () => void;
  pasteObjects: () => void;
  pasteInPlace: () => void;

  // Guides
  addGuide: (orientation: "horizontal" | "vertical", position: number) => void;
  removeGuide: (id: string) => void;
  updateGuide: (id: string, position: number) => void;
  toggleSnapping: () => void;
  toggleRulers: () => void;
  toggleGuides: () => void;
  toggleGrid: () => void;

  // Document state
  markDirty: () => void;
  markClean: () => void;
  setLoadingState: (state: LoadingState | null) => void;

  // Text
  setEditingTextId: (id: string | null) => void;

  // Dodge/Burn/Sponge settings
  setDodgeBurnRange: (range: "shadows" | "midtones" | "highlights") => void;
  setDodgeBurnExposure: (exposure: number) => void;
  setSpongeMode: (mode: "saturate" | "desaturate") => void;
  setSpongeFlow: (flow: number) => void;

  // Shape settings
  setShapeFill: (fill: string | null) => void;
  setShapeFillOpacity: (opacity: number) => void;
  setShapeStroke: (stroke: string | null) => void;
  setShapeStrokeOpacity: (opacity: number) => void;
  setShapeStrokeWidth: (width: number) => void;
  setShapeStrokeDash: (dash: StrokeDashStyle) => void;
  setShapeCornerRadius: (radius: number) => void;
  setShapePolygonSides: (sides: number) => void;
  setShapeStarPoints: (points: number) => void;

  // Clone stamp
  setCloneSource: (source: CloneSource | null) => void;
  setCloneAligned: (aligned: boolean) => void;

  // Fill tool settings
  setFillTolerance: (tolerance: number) => void;
  setFillContiguous: (contiguous: boolean) => void;

  // Gradient tool settings
  setGradientType: (type: "linear" | "radial") => void;
  setGradientOpacity: (opacity: number) => void;
  setGradientReverse: (reverse: boolean) => void;

  // Pixel brush settings
  setPixelBrushStrength: (strength: number) => void;

  // Right panel
  setRightPanelTab: (tab: "layers" | "adjustments" | "history") => void;
  toggleRightPanel: () => void;
}
