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
  resultUrl: null,
  resultSize: null,
  originalSize: null,
  error: null,
  jobId: null,

  addImages: (files) => {
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
      phase: "editing",
      resultUrl: null,
      resultSize: null,
      error: null,
    });

    for (const img of newImages) {
      if (img.previewLoading) {
        const imgId = img.id;
        fetchDecodedPreview(img.file).then((result) => {
          const current = get();
          const idx = current.images.findIndex((i) => i.id === imgId);
          if (idx === -1) return;
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
    cancelActiveCollageRun();
    const state = get();
    const img = state.images[index];
    if (img) {
      URL.revokeObjectURL(img.blobUrl);
      if (img.previewBlobUrl) revokePreviewUrl(img.previewBlobUrl);
    }
    const newImages = state.images.filter((_, i) => i !== index);
    if (newImages.length === 0) {
      get().reset();
      return;
    }
    const template = getDefaultTemplate(newImages.length);
    const assignments = buildDefaultAssignments(newImages.length, template.cells.length);
    set({
      images: newImages,
      templateId: template.id,
      cellAssignments: assignments,
      cellTransforms: {},
      phase: "editing",
      resultUrl: null,
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
      resultUrl: null,
      resultSize: null,
      error: null,
      selectedCell: null,
    });
  },

  setTemplateId: (id) => {
    const state = get();
    const template = COLLAGE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const assignments = buildDefaultAssignments(state.images.length, template.cells.length);
    set({ templateId: id, cellAssignments: assignments, cellTransforms: {}, resultUrl: null });
  },

  setCellAssignment: (cellIndex, imageIndex) => {
    const state = get();
    const newAssignments = [...state.cellAssignments];
    newAssignments[cellIndex] = imageIndex;
    set({ cellAssignments: newAssignments, resultUrl: null });
  },

  swapCells: (a, b) => {
    const state = get();
    const newAssignments = [...state.cellAssignments];
    const newTransforms = { ...state.cellTransforms };
    // Swap assignments
    [newAssignments[a], newAssignments[b]] = [newAssignments[b], newAssignments[a]];
    // Swap transforms
    const tmpT = newTransforms[a];
    newTransforms[a] = newTransforms[b];
    newTransforms[b] = tmpT;
    set({ cellAssignments: newAssignments, cellTransforms: newTransforms, resultUrl: null });
  },

  setCellTransform: (cellIndex, transform) => {
    const state = get();
    const current = state.cellTransforms[cellIndex] ?? { ...DEFAULT_TRANSFORM };
    set({
      cellTransforms: {
        ...state.cellTransforms,
        [cellIndex]: { ...current, ...transform },
      },
      resultUrl: null,
    });
  },

  resetCellTransform: (cellIndex) => {
    const state = get();
    const newTransforms = { ...state.cellTransforms };
    delete newTransforms[cellIndex];
    set({ cellTransforms: newTransforms, resultUrl: null });
  },

  setGap: (v) => set({ gap: v, resultUrl: null }),
  setCornerRadius: (v) => set({ cornerRadius: v, resultUrl: null }),
  setBackgroundColor: (color) => set({ backgroundColor: color, resultUrl: null }),
  setBgPreset: (preset) => {
    const colors: Record<string, string> = {
      white: "#FFFFFF",
      black: "#000000",
      transparent: "transparent",
    };
    if (preset === "custom") {
      set({ bgPreset: preset });
    } else {
      set({ bgPreset: preset, backgroundColor: colors[preset], resultUrl: null });
    }
  },
  setAspectRatio: (v) => set({ aspectRatio: v, resultUrl: null }),
  setOutputFormat: (v) => set({ outputFormat: v, resultUrl: null }),
  setQuality: (v) => set({ quality: v, resultUrl: null }),
  setSelectedCell: (v) => set({ selectedCell: v }),
  setPhase: (v) => set({ phase: v }),
  setProgress: (v) => set({ progress: v }),
  setResult: (url, size, originalSize, jobId) =>
    set({ resultUrl: url, resultSize: size, originalSize, jobId, phase: "result", error: null }),
  setError: (e) => set({ error: e, phase: "editing" }),
  reset: () => {
    cancelActiveCollageRun();
    const state = get();
    for (const img of state.images) {
      URL.revokeObjectURL(img.blobUrl);
      if (img.previewBlobUrl) revokePreviewUrl(img.previewBlobUrl);
    }
    nextImageId = 0;
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
      resultUrl: null,
      resultSize: null,
      originalSize: null,
      error: null,
      jobId: null,
    });
  },
}));
