import { create } from "zustand";

export interface Base64Result {
  /**
   * The file-store entry this was encoded from. Names repeat (every pasted
   * screenshot is "image.png"), so this is what ties a result to its file.
   */
  entryId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  encodedSize: number;
  overheadPercent: number;
  base64: string;
  dataUri: string;
}

export interface Base64Error {
  /** The file-store entry that failed. See Base64Result.entryId. */
  entryId: string;
  filename: string;
  error: string;
}

export interface Base64Progress {
  completed: number;
  total: number;
  currentFile: string;
}

interface Base64State {
  results: Base64Result[];
  errors: Base64Error[];
  processing: boolean;
  progress: Base64Progress | null;
  expandedIndex: number;

  setResults: (results: Base64Result[], errors: Base64Error[]) => void;
  setProcessing: (v: boolean) => void;
  setProgress: (p: Base64Progress | null) => void;
  addResult: (result: Base64Result) => void;
  addError: (error: Base64Error) => void;
  setExpandedIndex: (i: number) => void;
  reset: () => void;
}

export const useBase64Store = create<Base64State>((set) => ({
  results: [],
  errors: [],
  processing: false,
  progress: null,
  expandedIndex: 0,

  setResults: (results, errors) => set({ results, errors, expandedIndex: 0 }),
  setProcessing: (v) => set({ processing: v }),
  setProgress: (p) => set({ progress: p }),
  addResult: (result) => set((s) => ({ results: [...s.results, result] })),
  addError: (error) => set((s) => ({ errors: [...s.errors, error] })),
  setExpandedIndex: (i) => set({ expandedIndex: i }),
  reset: () =>
    set({ results: [], errors: [], processing: false, progress: null, expandedIndex: 0 }),
}));
