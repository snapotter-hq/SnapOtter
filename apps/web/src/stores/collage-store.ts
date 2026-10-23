import { create } from "zustand";
import { COLLAGE_TEMPLATES, getDefaultTemplate } from "@/lib/collage-templates";
import { fetchDecodedPreview, needsServerPreview, revokePreviewUrl } from "@/lib/image-preview";

export type AspectRatio = "free" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16" | "4:5";
export type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "jxl";
export type Phase = "upload" | "editing" | "processing" | "result";

export interface CollageImage {
  id: string;
  file: File;
  blobUrl: string;
  previewBlobUrl?: string;
  previewLoading: boolean;
}

export type ObjectFit = "cover" | "contain";

export interface CellTransform {
  panX: number; // percentage -100..100
  panY: number; // percentage -100..100
  zoom: number; // 1.0 to 3.0
  objectFit: ObjectFit;
}

interface CollageState {
  // Images
  images: CollageImage[];

  // Layout
  templateId: string;
  cellAssignments: number[]; // maps cellIndex -> imageIndex (-1 if empty)

  // Per-cell transforms
  cellTransforms: Record<number, CellTransform>;

  // Style
  gap: number;
  cornerRadius: number;
  backgroundColor: string;
  bgPreset: "white" | "black" | "transparent" | "custom";

  // Canvas
  aspectRatio: AspectRatio;

  // Output
  outputFormat: OutputFormat;
  quality: number;

  // UI state
  selectedCell: number | null;
  phase: Phase;
  progress: number;
  resultUrl: string | null;
  resultSize: number | null;
  originalSize: number | null;
  error: string | null;
  jobId: string | null;

  // Actions
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
  setTemplateId: (id: string) => void;
  setCellAssignment: (cellIndex: number, imageIndex: number) => void;
  swapCells: (a: number, b: number) => void;
  setCellTransform: (cellIndex: number, transform: Partial<CellTransform>) => void;
  resetCellTransform: (cellIndex: number) => void;
  setGap: (v: number) => void;
  setCornerRadius: (v: number) => void;
  setBackgroundColor: (color: string) => void;
  setBgPreset: (preset: "white" | "black" | "transparent" | "custom") => void;
  setAspectRatio: (v: AspectRatio) => void;
  setOutputFormat: (v: OutputFormat) => void;
  setQuality: (v: number) => void;
  setSelectedCell: (v: number | null) => void;
  setPhase: (v: Phase) => void;
  setProgress: (v: number) => void;
  setResult: (url: string, size: number, originalSize: number, jobId: string) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

const DEFAULT_TRANSFORM: CellTransform = { panX: 0, panY: 0, zoom: 1, objectFit: "cover" };

const CLEARED_RESULT = {
  resultUrl: null,
  resultSize: null,
  originalSize: null,
  jobId: null,
} as const;

let nextImageId = 0;
let activeCollageAbort: (() => void) | null = null;
let collageRunId = 0;

export function beginCollageRun(abort: () => void): {
  isCurrent: () => boolean;
  end: () => void;
} {
  activeCollageAbort?.();
  const runId = ++collageRunId;
  activeCollageAbort = abort;
  return {
    isCurrent: () => runId === collageRunId,
    end: () => {
      if (activeCollageAbort === abort) activeCollageAbort = null;
    },
  };
}

function cancelActiveCollageRun() {
  collageRunId++;
  const abort = activeCollageAbort;
  activeCollageAbort = null;
  abort?.();
}

function clearCollageResult(state: Pick<CollageState, "images" | "phase">): {
  resultUrl: null;
  resultSize: null;
  originalSize: null;
  jobId: null;
  phase: Phase;
  error: null;
} {
  cancelActiveCollageRun();
  const phase =
    state.phase === "processing" || state.phase === "result"
      ? state.images.length > 0
        ? "editing"
        : "upload"
      : state.phase;
  return {
    ...CLEARED_RESULT,
    phase,
    error: null,
  };
}

function buildDefaultAssignments(imageCount: number, cellCount: number): number[] {
  const assignments: number[] = [];
  for (let i = 0; i < cellCount; i++) {
    assignments.push(i < imageCount ? i : -1);
  }
  return assignments;
}

export const useCollageStore = create<CollageState>((set, get) => ({
  images: [],
  templateId: "2-h-equal",
  cellAssignments: [],
  cellTransforms: {},
  gap: 8,
  cornerRadius: 0,
  backgroundColor: "#FFFFFF",
  bgPreset: "white",
  aspectRatio: "free",
  outputFormat: "png",
  quality: 90,
  selectedCell: null,
  phase: "upload",
  progress: 0,
  ...CLEARED_RESULT,
  error: null,

  addImages: (files) => {
    if (files.length === 0) return;
    cancelActiveCollageRun();
    const newImages: CollageImage[] = files.map((f) => ({
      id: `img-${++nextImageId}`,
      file: f,
      blobUrl: URL.createObjectURL(f),
      previewLoading: needsServerPreview(f),
    }));
    const state = get();
    const allImages = [...state.images, ...newImages];
    const template = getDefaultTemplate(allImages.length);
    const cellCount = template.cells.length;
    const assignments = buildDefaultAssignments(allImages.length, cellCount);

    set({
      images: allImages,
      templateId: template.id,
      cellAssignments: assignments,
      cellTransforms: {},
      selectedCell: null,
      phase: "editing",
      ...CLEARED_RESULT,
      error: null,
    });

    for (const img of newImages) {
      if (img.previewLoading) {
        const imgId = img.id;
        const file = img.file;
        fetchDecodedPreview(file).then((result) => {
          const current = get();
          const idx = current.images.findIndex((i) => i.id === imgId && i.file === file);
          if (idx === -1) {
            if (result?.url) revokePreviewUrl(result.url);
            return;
          }
          const updated = [...current.images];
          updated[idx] = {
            ...updated[idx],
            previewLoading: false,
            ...(result ? { previewBlobUrl: result.url } : {}),
          };
          set({ images: updated });
        });
      }
    }
  },

  removeImage: (index) => {
    const state = get();
    const img = state.images[index];
    if (!img) return;
    const newImages = state.images.filter((_, i) => i !== index);
    if (newImages.length === 0) {
      get().reset();
      return;
    }
    cancelActiveCollageRun();
    URL.revokeObjectURL(img.blobUrl);
    if (img.previewBlobUrl) revokePreviewUrl(img.previewBlobUrl);
    const template = getDefaultTemplate(newImages.length);
    const assignments = buildDefaultAssignments(newImages.length, template.cells.length);
    set({
      images: newImages,
      templateId: template.id,
      cellAssignments: assignments,
      cellTransforms: {},
      selectedCell: null,
      phase: "editing",
      ...CLEARED_RESULT,
      error: null,
    });
  },

  clearImages: () => {
    cancelActiveCollageRun();
    const state = get();
    for (const img of state.images) {
      URL.revokeObjectURL(img.blobUrl);
      if (img.previewBlobUrl) revokePreviewUrl(img.previewBlobUrl);
    }
    set({
      images: [],
      cellAssignments: [],
      cellTransforms: {},
      phase: "upload",
      ...CLEARED_RESULT,
      error: null,
      selectedCell: null,
    });
  },

  setTemplateId: (id) => {
    const state = get();
    const template = COLLAGE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const assignments = buildDefaultAssignments(state.images.length, template.cells.length);
    set({
      templateId: id,
      cellAssignments: assignments,
      cellTransforms: {},
      selectedCell: null,
      ...clearCollageResult(state),
    });
  },

  setCellAssignment: (cellIndex, imageIndex) => {
    const state = get();
    const newAssignments = [...state.cellAssignments];
    newAssignments[cellIndex] = imageIndex;
    if (imageIndex < 0) {
      const newTransforms = { ...state.cellTransforms };
      delete newTransforms[cellIndex];
      set({
        cellAssignments: newAssignments,
        cellTransforms: newTransforms,
        selectedCell: state.selectedCell === cellIndex ? null : state.selectedCell,
        ...clearCollageResult(state),
      });
      return;
    }
    set({ cellAssignments: newAssignments, ...clearCollageResult(state) });
  },

  swapCells: (a, b) => {
    const state = get();
    const newAssignments = [...state.cellAssignments];
    const newTransforms = { ...state.cellTransforms };
    // Swap assignments
    [newAssignments[a], newAssignments[b]] = [newAssignments[b], newAssignments[a]];
    // Swap transforms
    const tmpT = newTransforms[a];
    if (newTransforms[b] !== undefined) {
      newTransforms[a] = newTransforms[b];
    } else {
      delete newTransforms[a];
    }
    if (tmpT !== undefined) {
      newTransforms[b] = tmpT;
    } else {
      delete newTransforms[b];
    }
    const selectedCell =
      state.selectedCell === a ? b : state.selectedCell === b ? a : state.selectedCell;
    set({
      cellAssignments: newAssignments,
      cellTransforms: newTransforms,
      selectedCell,
      ...clearCollageResult(state),
    });
  },

  setCellTransform: (cellIndex, transform) => {
    const state = get();
    const current = state.cellTransforms[cellIndex] ?? { ...DEFAULT_TRANSFORM };
    set({
      cellTransforms: {
        ...state.cellTransforms,
        [cellIndex]: { ...current, ...transform },
      },
      ...clearCollageResult(state),
    });
  },

  resetCellTransform: (cellIndex) => {
    const state = get();
    const newTransforms = { ...state.cellTransforms };
    delete newTransforms[cellIndex];
    set({ cellTransforms: newTransforms, ...clearCollageResult(state) });
  },

  setGap: (v) => set({ gap: v, ...clearCollageResult(get()) }),
  setCornerRadius: (v) => set({ cornerRadius: v, ...clearCollageResult(get()) }),
  setBackgroundColor: (color) => set({ backgroundColor: color, ...clearCollageResult(get()) }),
  setBgPreset: (preset) => {
    const colors: Record<string, string> = {
      white: "#FFFFFF",
      black: "#000000",
      transparent: "transparent",
    };
    if (preset === "custom") {
      set({ bgPreset: preset });
    } else {
      set({ bgPreset: preset, backgroundColor: colors[preset], ...clearCollageResult(get()) });
    }
  },
  setAspectRatio: (v) => set({ aspectRatio: v, ...clearCollageResult(get()) }),
  setOutputFormat: (v) => set({ outputFormat: v, ...clearCollageResult(get()) }),
  setQuality: (v) => set({ quality: v, ...clearCollageResult(get()) }),
  setSelectedCell: (v) => set({ selectedCell: v }),
  setPhase: (v) => set(v === "processing" ? { phase: v, ...CLEARED_RESULT } : { phase: v }),
  setProgress: (v) => set({ progress: v }),
  setResult: (url, size, originalSize, jobId) =>
    set({ resultUrl: url, resultSize: size, originalSize, jobId, phase: "result", error: null }),
  setError: (e) => set(e ? { error: e, phase: "editing" } : { error: null }),
  reset: () => {
    cancelActiveCollageRun();
    const state = get();
    for (const img of state.images) {
      URL.revokeObjectURL(img.blobUrl);
      if (img.previewBlobUrl) revokePreviewUrl(img.previewBlobUrl);
    }
    set({
      images: [],
      templateId: "2-h-equal",
      cellAssignments: [],
      cellTransforms: {},
      gap: 8,
      cornerRadius: 0,
      backgroundColor: "#FFFFFF",
      bgPreset: "white",
      aspectRatio: "free",
      outputFormat: "png",
      quality: 90,
      selectedCell: null,
      phase: "upload",
      progress: 0,
      ...CLEARED_RESULT,
      error: null,
    });
  },
}));
