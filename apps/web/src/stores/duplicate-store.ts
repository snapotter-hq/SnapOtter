import { create } from "zustand";

export interface DuplicateFileInfo {
  filename: string;
  similarity: number;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  isBest: boolean;
  thumbnail: string | null;
}

export interface DuplicateGroup {
  groupId: number;
  files: DuplicateFileInfo[];
}

export interface SkippedFile {
  filename: string;
  reason: string;
}

export interface DuplicateResult {
  totalImages: number;
  uniqueImages: number;
  spaceSaveable: number;
  duplicateGroups: DuplicateGroup[];
  skippedFiles?: SkippedFile[];
}

interface DuplicateState {
  results: DuplicateResult | null;
  scanning: boolean;
  /** Why the last scan failed. Held here, not in the panel, so a panel that
   *  remounted over a scan still out can show how it ended (#2314). */
  error: string | null;
  viewMode: "overview" | "detail";
  selectedGroupIndex: number;
  bestOverrides: Record<number, number>;

  setResults: (r: DuplicateResult | null) => void;
  setScanning: (v: boolean) => void;
  setError: (message: string | null) => void;
  setViewMode: (m: "overview" | "detail") => void;
  setSelectedGroup: (i: number) => void;
  overrideBest: (groupIndex: number, fileIndex: number) => void;
  reset: () => void;
}

export const useDuplicateStore = create<DuplicateState>((set) => ({
  results: null,
  scanning: false,
  error: null,
  viewMode: "overview",
  selectedGroupIndex: 0,
  bestOverrides: {},

  setResults: (results) =>
    set({ results, viewMode: "overview", selectedGroupIndex: 0, bestOverrides: {} }),
  setScanning: (scanning) => set({ scanning }),
  setError: (error) => set({ error }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedGroup: (selectedGroupIndex) => set({ selectedGroupIndex, viewMode: "detail" }),
  overrideBest: (groupIndex, fileIndex) =>
    set((s) => ({ bestOverrides: { ...s.bestOverrides, [groupIndex]: fileIndex } })),
  reset: () =>
    set({
      results: null,
      scanning: false,
      error: null,
      viewMode: "overview",
      selectedGroupIndex: 0,
      bestOverrides: {},
    }),
}));
