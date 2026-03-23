import { create } from "zustand";

export interface FileEntry {
  file: File;
  blobUrl: string;
  processedUrl: string | null;
  processedSize: number | null;
  originalSize: number;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEntry(file: File): FileEntry {
  return {
    file,
    blobUrl: URL.createObjectURL(file),
    processedUrl: null,
    processedSize: null,
    originalSize: file.size,
    status: "pending",
    error: null,
  };
}

function revokeEntries(entries: FileEntry[]): void {
  for (const entry of entries) {
    URL.revokeObjectURL(entry.blobUrl);
    if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
  }
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

  // Backward compat getters (computed from entries + selectedIndex)
  readonly files: File[];
  readonly currentEntry: FileEntry | undefined;
  readonly hasFiles: boolean;
  readonly allProcessed: boolean;
  readonly selectedFileName: string | null;
  readonly selectedFileSize: number | null;
  readonly originalBlobUrl: string | null;
  readonly processedUrl: string | null;
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
  setProcessedUrl: (url: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  undoProcessing: () => void;
  reset: () => void;
}

/**
 * Compute backward-compat derived values from core state.
 * Called after every state mutation to keep derived fields in sync.
 */
function deriveCompat(entries: FileEntry[], selectedIndex: number) {
  const entry = entries[selectedIndex];
  return {
    files: entries.map((e) => e.file),
    currentEntry: entry,
    hasFiles: entries.length > 0,
    allProcessed:
      entries.length > 0 && entries.every((e) => e.status === "completed"),
    selectedFileName: entry ? entry.file.name : null,
    selectedFileSize: entry ? entry.file.size : null,
    originalBlobUrl: entry ? entry.blobUrl : null,
    processedUrl: entry ? entry.processedUrl : null,
    originalSize: entry ? entry.originalSize : null,
    processedSize: entry ? entry.processedSize : null,
  };
}

export const useFileStore = create<FileState>((set, get) => ({
  entries: [],
  selectedIndex: 0,
  batchZipBlob: null,
  batchZipFilename: null,
  processing: false,
  error: null,

  // Initial derived values (empty state)
  ...deriveCompat([], 0),

  // -- Actions --------------------------------------------------------------

  setFiles: (files) => {
    revokeEntries(get().entries);
    const entries = files.map(createEntry);
    set({
      entries,
      selectedIndex: 0,
      error: null,
      ...deriveCompat(entries, 0),
    });
  },

  addFiles: (files) => {
    const entries = [...get().entries, ...files.map(createEntry)];
    const idx = get().selectedIndex;
    set({ entries, ...deriveCompat(entries, idx) });
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
      ...deriveCompat(newEntries, newIndex),
    });
  },

  setSelectedIndex: (index) => {
    set({
      selectedIndex: index,
      ...deriveCompat(get().entries, index),
    });
  },

  navigateNext: () => {
    const { selectedIndex, entries } = get();
    if (selectedIndex < entries.length - 1) {
      const idx = selectedIndex + 1;
      set({ selectedIndex: idx, ...deriveCompat(entries, idx) });
    }
  },

  navigatePrev: () => {
    const { selectedIndex, entries } = get();
    if (selectedIndex > 0) {
      const idx = selectedIndex - 1;
      set({ selectedIndex: idx, ...deriveCompat(entries, idx) });
    }
  },

  updateEntry: (index, patch) => {
    const entries = [...get().entries];
    if (!entries[index]) return;
    entries[index] = { ...entries[index], ...patch };
    const idx = get().selectedIndex;
    set({ entries, ...deriveCompat(entries, idx) });
  },

  setBatchZip: (blob, filename) =>
    set({ batchZipBlob: blob, batchZipFilename: filename }),

  setProcessing: (v) => set({ processing: v }),

  setError: (e) => set({ error: e, processing: false }),

  setJobId: (_id) => {
    // no-op for backward compat
  },

  setProcessedUrl: (url) => {
    const { entries, selectedIndex } = get();
    if (!entries[selectedIndex]) return;
    const updated = [...entries];
    if (url) {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: url,
        status: "completed",
      };
    } else {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: null,
        status: "pending",
      };
    }
    set({ entries: updated, ...deriveCompat(updated, selectedIndex) });
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
    set({ entries: updated, ...deriveCompat(updated, selectedIndex) });
  },

  undoProcessing: () => {
    const { entries, selectedIndex } = get();
    for (const entry of entries) {
      if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
    }
    const resetEntries = entries.map((e) => ({
      ...e,
      processedUrl: null,
      processedSize: null,
      status: "pending" as const,
      error: null,
    }));
    set({
      entries: resetEntries,
      error: null,
      ...deriveCompat(resetEntries, selectedIndex),
    });
  },

  reset: () => {
    revokeEntries(get().entries);
    set({
      entries: [],
      selectedIndex: 0,
      batchZipBlob: null,
      batchZipFilename: null,
      processing: false,
      error: null,
      ...deriveCompat([], 0),
    });
  },
}));
