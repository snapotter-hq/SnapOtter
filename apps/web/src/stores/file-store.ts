import { create } from "zustand";

interface FileState {
  files: File[];
  jobId: string | null;
  processedUrl: string | null;
  /** Blob URL for the original image (for before/after comparison). */
  originalBlobUrl: string | null;
  processing: boolean;
  error: string | null;
  originalSize: number | null;
  processedSize: number | null;
  selectedFileName: string | null;
  selectedFileSize: number | null;
  setFiles: (files: File[]) => void;
  setJobId: (id: string) => void;
  setProcessedUrl: (url: string | null) => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  /** Clear processed result but keep the original uploaded file. */
  undoProcessing: () => void;
  reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  jobId: null,
  processedUrl: null,
  originalBlobUrl: null,
  processing: false,
  error: null,
  originalSize: null,
  processedSize: null,
  selectedFileName: null,
  selectedFileSize: null,
  setFiles: (files) => {
    // Revoke old blob URL if any
    const old = get().originalBlobUrl;
    if (old) URL.revokeObjectURL(old);
    // Create a blob URL for the first file for before/after preview
    const blobUrl = files.length > 0 ? URL.createObjectURL(files[0]) : null;
    const firstName = files.length > 0 ? files[0].name : null;
    const firstSize = files.length > 0 ? files[0].size : null;
    set({
      files,
      error: null,
      originalBlobUrl: blobUrl,
      selectedFileName: firstName,
      selectedFileSize: firstSize,
    });
  },
  setJobId: (id) => set({ jobId: id }),
  setProcessedUrl: (url) => set({ processedUrl: url }),
  setProcessing: (v) => set({ processing: v }),
  setError: (e) => set({ error: e, processing: false }),
  setSizes: (original, processed) =>
    set({ originalSize: original, processedSize: processed }),
  undoProcessing: () => {
    set({
      processedUrl: null,
      jobId: null,
      processedSize: null,
      error: null,
    });
  },
  reset: () => {
    const old = get().originalBlobUrl;
    if (old) URL.revokeObjectURL(old);
    set({
      files: [],
      jobId: null,
      processedUrl: null,
      originalBlobUrl: null,
      processing: false,
      error: null,
      originalSize: null,
      processedSize: null,
      selectedFileName: null,
      selectedFileSize: null,
    });
  },
}));
