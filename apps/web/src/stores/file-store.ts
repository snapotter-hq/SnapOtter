import { create } from "zustand";

interface FileState {
  files: File[];
  jobId: string | null;
  processedUrl: string | null;
  processing: boolean;
  error: string | null;
  originalSize: number | null;
  processedSize: number | null;
  setFiles: (files: File[]) => void;
  setJobId: (id: string) => void;
  setProcessedUrl: (url: string | null) => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  reset: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  jobId: null,
  processedUrl: null,
  processing: false,
  error: null,
  originalSize: null,
  processedSize: null,
  setFiles: (files) => set({ files, error: null }),
  setJobId: (id) => set({ jobId: id }),
  setProcessedUrl: (url) => set({ processedUrl: url }),
  setProcessing: (v) => set({ processing: v }),
  setError: (e) => set({ error: e, processing: false }),
  setSizes: (original, processed) =>
    set({ originalSize: original, processedSize: processed }),
  reset: () =>
    set({
      files: [],
      jobId: null,
      processedUrl: null,
      processing: false,
      error: null,
      originalSize: null,
      processedSize: null,
    }),
}));
