import { create } from "zustand";
import { fetchDecodedPreview, needsServerPreview } from "@/lib/image-preview";

export interface FileEntry {
  file: File;
  blobUrl: string;
  previewLoading: boolean;
  processedUrl: string | null;
  processedPreviewUrl: string | null;
  processedFilename: string | null;
  processedSize: number | null;
  originalSize: number;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  serverFileId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEntry(file: File): FileEntry {
  return {
    file,
    blobUrl: URL.createObjectURL(file),
    previewLoading: needsServerPreview(file),
    processedUrl: null,
    processedPreviewUrl: null,
    processedFilename: null,
    processedSize: null,
    originalSize: file.size,
    status: "pending",
    error: null,
    serverFileId: undefined,
  };
}

function revokeEntries(entries: FileEntry[]): void {
  for (const entry of entries) {
    URL.revokeObjectURL(entry.blobUrl);
    if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
  }
}

// ---------------------------------------------------------------------------
// Derived state helpers
// ---------------------------------------------------------------------------

/**
 * Derive fields from the selected entry. Only recomputes fields that are
 * actually consumed by components (tool-page, home-page, use-tool-processor).
 */
function deriveSelected(entries: FileEntry[], selectedIndex: number) {
  const entry = entries[selectedIndex];
  return {
    currentEntry: entry,
    selectedFileName: entry ? entry.file.name : null,
    selectedFileSize: entry ? entry.file.size : null,
    originalBlobUrl: entry ? entry.blobUrl : null,
    processedUrl: entry ? entry.processedUrl : null,
    processedPreviewUrl: entry ? entry.processedPreviewUrl : null,
    originalSize: entry ? entry.originalSize : null,
    processedSize: entry ? entry.processedSize : null,
  };
}

/**
 * Build the File[] array from entries, reusing the previous reference
 * when the underlying File objects haven't changed.
 */
let prevFiles: File[] = [];
function deriveFiles(entries: FileEntry[]): File[] {
  if (entries.length === prevFiles.length && entries.every((e, i) => e.file === prevFiles[i])) {
    return prevFiles;
  }
  prevFiles = entries.map((e) => e.file);
  return prevFiles;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface FileState {
  entries: FileEntry[];
  selectedIndex: number;
  batchZipBlob: Blob | null;
  batchZipFilename: string | null;
  processing: boolean;
  error: string | null;

  // Derived from entries (selected entry fields)
  readonly files: File[];
  readonly currentEntry: FileEntry | undefined;
  readonly selectedFileName: string | null;
  readonly selectedFileSize: number | null;
  readonly originalBlobUrl: string | null;
  readonly processedUrl: string | null;
  readonly processedPreviewUrl: string | null;
  readonly originalSize: number | null;
  readonly processedSize: number | null;

  // Actions
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  updateEntry: (index: number, patch: Partial<FileEntry>) => void;
  setBatchZip: (blob: Blob, filename: string) => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null) => void;
  setJobId: (id: string) => void;
  setProcessedUrl: (url: string | null, previewUrl?: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  undoProcessing: () => void;
  reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  entries: [],
  selectedIndex: 0,
  batchZipBlob: null,
  batchZipFilename: null,
  processing: false,
  error: null,

  // Initial derived values (empty state)
  files: [],
  ...deriveSelected([], 0),

  // -- Actions --------------------------------------------------------------

  setFiles: (files) => {
    revokeEntries(get().entries);
    const entries = files.map(createEntry);
    set({
      entries,
      selectedIndex: 0,
      error: null,
      files: deriveFiles(entries),
      ...deriveSelected(entries, 0),
    });
    // Async: decode HEIC/HEIF files for browser preview
    for (let i = 0; i < entries.length; i++) {
      if (needsServerPreview(entries[i].file)) {
        const file = entries[i].file;
        fetchDecodedPreview(file).then((url) => {
          const state = get();
          if (state.entries[i]?.file !== file) return;
          const updated = [...state.entries];
          updated[i] = { ...updated[i], previewLoading: false, ...(url ? { blobUrl: url } : {}) };
          set({ entries: updated, ...deriveSelected(updated, state.selectedIndex) });
        });
      }
    }
  },

  addFiles: (files) => {
    const oldLen = get().entries.length;
    const newEntries = files.map(createEntry);
    const entries = [...get().entries, ...newEntries];
    const idx = get().selectedIndex;
    set({ entries, files: deriveFiles(entries), ...deriveSelected(entries, idx) });
    // Async: decode HEIC/HEIF files for browser preview
    for (let j = 0; j < newEntries.length; j++) {
      const i = oldLen + j;
      if (needsServerPreview(newEntries[j].file)) {
        const file = newEntries[j].file;
        fetchDecodedPreview(file).then((url) => {
          const state = get();
          if (state.entries[i]?.file !== file) return;
          const updated = [...state.entries];
          updated[i] = { ...updated[i], previewLoading: false, ...(url ? { blobUrl: url } : {}) };
          set({ entries: updated, ...deriveSelected(updated, state.selectedIndex) });
        });
      }
    }
  },

  removeFile: (index) => {
    const { entries, selectedIndex } = get();
    const removed = entries[index];
    if (!removed) return;

    URL.revokeObjectURL(removed.blobUrl);
    if (removed.processedUrl) URL.revokeObjectURL(removed.processedUrl);

    const newEntries = entries.filter((_, i) => i !== index);
    let newIndex = selectedIndex;
    if (index < selectedIndex) {
      newIndex = selectedIndex - 1;
    } else if (selectedIndex >= newEntries.length && newEntries.length > 0) {
      newIndex = newEntries.length - 1;
    } else if (newEntries.length === 0) {
      newIndex = 0;
    }
    set({
      entries: newEntries,
      selectedIndex: newIndex,
      files: deriveFiles(newEntries),
      ...deriveSelected(newEntries, newIndex),
    });
  },

  setSelectedIndex: (index) => {
    set({
      selectedIndex: index,
      ...deriveSelected(get().entries, index),
    });
  },

  navigateNext: () => {
    const { selectedIndex, entries } = get();
    if (selectedIndex < entries.length - 1) {
      const idx = selectedIndex + 1;
      set({ selectedIndex: idx, ...deriveSelected(entries, idx) });
    }
  },

  navigatePrev: () => {
    const { selectedIndex, entries } = get();
    if (selectedIndex > 0) {
      const idx = selectedIndex - 1;
      set({ selectedIndex: idx, ...deriveSelected(entries, idx) });
    }
  },

  updateEntry: (index, patch) => {
    const entries = [...get().entries];
    if (!entries[index]) return;
    entries[index] = { ...entries[index], ...patch };
    const idx = get().selectedIndex;
    set({ entries, files: deriveFiles(entries), ...deriveSelected(entries, idx) });
  },

  setBatchZip: (blob, filename) => set({ batchZipBlob: blob, batchZipFilename: filename }),

  setProcessing: (v) => set({ processing: v }),

  setError: (e) => set({ error: e, processing: false }),

  setJobId: (_id) => {
    // no-op for backward compat
  },

  setProcessedUrl: (url, previewUrl) => {
    const { entries, selectedIndex } = get();
    if (!entries[selectedIndex]) return;
    const updated = [...entries];
    if (url) {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: url,
        processedPreviewUrl: previewUrl ?? null,
        processedFilename: null,
        status: "completed",
      };
    } else {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        status: "pending",
      };
    }
    set({ entries: updated, ...deriveSelected(updated, selectedIndex) });
  },

  setSizes: (original, processed) => {
    const { entries, selectedIndex } = get();
    if (!entries[selectedIndex]) return;
    const updated = [...entries];
    updated[selectedIndex] = {
      ...updated[selectedIndex],
      originalSize: original,
      processedSize: processed,
    };
    set({ entries: updated, ...deriveSelected(updated, selectedIndex) });
  },

  undoProcessing: () => {
    const { entries, selectedIndex } = get();
    for (const entry of entries) {
      if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
    }
    const resetEntries = entries.map((e) => ({
      ...e,
      processedUrl: null,
      processedPreviewUrl: null,
      processedFilename: null,
      processedSize: null,
      status: "pending" as const,
      error: null,
    }));
    set({
      entries: resetEntries,
      batchZipBlob: null,
      batchZipFilename: null,
      processing: false,
      error: null,
      files: deriveFiles(resetEntries),
      ...deriveSelected(resetEntries, selectedIndex),
    });
  },

  reset: () => {
    revokeEntries(get().entries);
    prevFiles = [];
    set({
      entries: [],
      selectedIndex: 0,
      batchZipBlob: null,
      batchZipFilename: null,
      processing: false,
      error: null,
      files: [],
      ...deriveSelected([], 0),
    });
  },
}));
