import {
  ANALYTICS_EVENTS,
  detectModalityFromMime,
  type LibrarySaveMode,
  type Modality,
} from "@snapotter/shared";
import { create } from "zustand";
import { fetchDecodedPreview, needsServerPreview } from "@/lib/image-preview";

export type PreviewKind = "image" | "video" | "audio" | "document" | "none";

export function previewKindFor(modality: Modality): PreviewKind {
  switch (modality) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "document":
      return "document";
    default:
      return "none";
  }
}

export interface FileEntry {
  /** Stable identity for this entry, unchanged across reordering. */
  id: string;
  file: File;
  blobUrl: string;
  previewLoading: boolean;
  processedUrl: string | null;
  processedPreviewUrl: string | null;
  processedFilename: string | null;
  processedSize: number | null;
  originalSize: number;
  originalWidth: number | null;
  originalHeight: number | null;
  status: "pending" | "processing" | "completed" | "failed";
  /**
   * The user took this result: downloaded it, saved it, or it auto-saved.
   *
   * The invariant: a result that just changed has not been taken. Any patch
   * that touches `processedUrl` invalidates the claim, changed value or not,
   * so a re-run never inherits the previous result's claim. Keying on the
   * field being present rather than on the value differing is the fail-safe
   * choice: the cost of over-clearing is one extra warning, the cost of
   * under-clearing is the navigation guard going silent on unsaved work.
   */
  claimed: boolean;
  error: string | null;
  serverFileId?: string;
  modality: Modality;
  previewKind: PreviewKind;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextEntryId = 0;

function createEntry(file: File): FileEntry {
  const modality = detectModalityFromMime(file.type);
  return {
    id: `entry-${++nextEntryId}`,
    file,
    blobUrl: URL.createObjectURL(file),
    previewLoading: needsServerPreview(file),
    processedUrl: null,
    processedPreviewUrl: null,
    processedFilename: null,
    processedSize: null,
    originalSize: file.size,
    originalWidth: null,
    originalHeight: null,
    status: "pending",
    claimed: false,
    error: null,
    serverFileId: undefined,
    modality,
    previewKind: previewKindFor(modality),
  };
}

function revokeEntries(entries: FileEntry[]): void {
  for (const entry of entries) {
    URL.revokeObjectURL(entry.blobUrl);
    if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
    if (entry.processedPreviewUrl) URL.revokeObjectURL(entry.processedPreviewUrl);
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
  batchZipClaimed: boolean;
  processing: boolean;
  error: string | null;
  activeJobId: string | null;
  cancelCurrentJob: (() => Promise<void>) | null;
  /** How library-sourced results are saved (#495): "new" keeps the original. */
  librarySaveMode: LibrarySaveMode;
  /** Library file id of the last run's auto-saved result, for the review UI. */
  lastSavedLibraryFileId: string | null;

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
  reorderFiles: (from: number, to: number) => void;
  reverseFiles: () => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  /** `claimed` is excluded: a patch touching `processedUrl` always resets it. */
  updateEntry: (index: number, patch: Omit<Partial<FileEntry>, "claimed">) => void;
  setBatchZip: (blob: Blob, filename: string) => void;
  markClaimed: (index: number) => void;
  markBatchClaimed: () => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null) => void;
  setActiveJob: (id: string | null, cancelFn: (() => Promise<void>) | null) => void;
  setLibrarySaveMode: (mode: LibrarySaveMode) => void;
  setLastSavedLibraryFileId: (id: string | null) => void;
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
  batchZipClaimed: false,
  processing: false,
  error: null,
  activeJobId: null,
  cancelCurrentJob: null,
  librarySaveMode: "new",
  lastSavedLibraryFileId: null,

  // Initial derived values (empty state)
  files: [],
  ...deriveSelected([], 0),

  // -- Actions --------------------------------------------------------------

  setFiles: (files) => {
    import("@/lib/analytics").then(({ track }) => {
      track(ANALYTICS_EVENTS.FILE_ADDED, { file_count: files.length });
    });
    revokeEntries(get().entries);
    const entries = files.map(createEntry);
    set({
      entries,
      selectedIndex: 0,
      error: null,
      // The previous run's zip describes files that are no longer loaded.
      batchZipBlob: null,
      batchZipFilename: null,
      batchZipClaimed: false,
      // A fresh file set is a fresh edit: the save-mode choice made for a
      // previous file must not carry over (#495 defaults to non-destructive).
      librarySaveMode: "new",
      files: deriveFiles(entries),
      ...deriveSelected(entries, 0),
    });
    // Async: decode HEIC/HEIF files for browser preview
    for (let i = 0; i < entries.length; i++) {
      if (needsServerPreview(entries[i].file)) {
        const file = entries[i].file;
        fetchDecodedPreview(file).then((result) => {
          const state = get();
          if (state.entries[i]?.file !== file) return;
          const updated = [...state.entries];
          const oldBlobUrl = updated[i].blobUrl;
          updated[i] = {
            ...updated[i],
            previewLoading: false,
            ...(result
              ? {
                  blobUrl: result.url,
                  originalWidth: result.originalWidth,
                  originalHeight: result.originalHeight,
                }
              : {}),
          };
          if (result && oldBlobUrl) URL.revokeObjectURL(oldBlobUrl);
          set({ entries: updated, ...deriveSelected(updated, state.selectedIndex) });
        });
      }
    }
  },

  addFiles: (files) => {
    import("@/lib/analytics").then(({ track }) => {
      track(ANALYTICS_EVENTS.FILE_ADDED, { file_count: files.length });
    });
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
        fetchDecodedPreview(file).then((result) => {
          const state = get();
          if (state.entries[i]?.file !== file) return;
          const updated = [...state.entries];
          const oldBlobUrl = updated[i].blobUrl;
          updated[i] = {
            ...updated[i],
            previewLoading: false,
            ...(result
              ? {
                  blobUrl: result.url,
                  originalWidth: result.originalWidth,
                  originalHeight: result.originalHeight,
                }
              : {}),
          };
          if (result && oldBlobUrl) URL.revokeObjectURL(oldBlobUrl);
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
    if (removed.processedPreviewUrl) URL.revokeObjectURL(removed.processedPreviewUrl);

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

  reorderFiles: (from, to) => {
    const { entries, selectedIndex } = get();
    if (from === to) return;
    if (from < 0 || from >= entries.length || to < 0 || to >= entries.length) return;

    const selectedId = entries[selectedIndex]?.id;
    const newEntries = [...entries];
    const [moved] = newEntries.splice(from, 1);
    newEntries.splice(to, 0, moved);

    const followed = selectedId ? newEntries.findIndex((e) => e.id === selectedId) : -1;
    const newIndex = followed === -1 ? selectedIndex : followed;
    set({
      entries: newEntries,
      selectedIndex: newIndex,
      files: deriveFiles(newEntries),
      ...deriveSelected(newEntries, newIndex),
    });
  },

  reverseFiles: () => {
    const { entries, selectedIndex } = get();
    if (entries.length < 2) return;

    const selectedId = entries[selectedIndex]?.id;
    const newEntries = [...entries].reverse();

    const followed = selectedId ? newEntries.findIndex((e) => e.id === selectedId) : -1;
    const newIndex = followed === -1 ? selectedIndex : followed;
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
    // Enforces the claim invariant; see the `claimed` field on FileEntry.
    const claimReset = "processedUrl" in patch ? { claimed: false } : null;
    entries[index] = { ...entries[index], ...patch, ...claimReset };
    const idx = get().selectedIndex;
    set({ entries, files: deriveFiles(entries), ...deriveSelected(entries, idx) });
  },

  setBatchZip: (blob, filename) =>
    set({ batchZipBlob: blob, batchZipFilename: filename, batchZipClaimed: false }),

  markClaimed: (index) => {
    const { entries, selectedIndex } = get();
    // The index is required: selectedIndex is not trustworthy at completion
    // time, since the user can change selection while a job runs.
    if (!entries[index] || entries[index].claimed) return;
    const next = [...entries];
    next[index] = { ...next[index], claimed: true };
    set({ entries: next, files: deriveFiles(next), ...deriveSelected(next, selectedIndex) });
  },

  markBatchClaimed: () => {
    const { entries, selectedIndex } = get();
    // The zip holds every result, so taking it takes all of them.
    const next = entries.map((e) => (e.claimed ? e : { ...e, claimed: true }));
    set({
      entries: next,
      batchZipClaimed: true,
      files: deriveFiles(next),
      ...deriveSelected(next, selectedIndex),
    });
  },

  setProcessing: (v) => set({ processing: v }),

  setError: (e) => set(e ? { error: e, processing: false } : { error: null }),

  setActiveJob: (id, cancelFn) => set({ activeJobId: id, cancelCurrentJob: cancelFn }),

  setJobId: (_id) => {
    // no-op for backward compat
  },

  setProcessedUrl: (url, previewUrl) => {
    const { entries, selectedIndex } = get();
    if (!entries[selectedIndex]) return;
    // Both branches reset `claimed`; see the invariant on FileEntry.
    const updated = [...entries];
    if (url) {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: url,
        processedPreviewUrl: previewUrl ?? null,
        processedFilename: null,
        status: "completed",
        claimed: false,
      };
    } else {
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        status: "pending",
        claimed: false,
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

  setLibrarySaveMode: (mode) => set({ librarySaveMode: mode }),

  setLastSavedLibraryFileId: (id) => set({ lastSavedLibraryFileId: id }),

  undoProcessing: () => {
    const { entries, selectedIndex } = get();
    for (const entry of entries) {
      if (entry.processedUrl) URL.revokeObjectURL(entry.processedUrl);
      if (entry.processedPreviewUrl) URL.revokeObjectURL(entry.processedPreviewUrl);
    }
    // Dropping every result clears every claim; see the invariant on FileEntry.
    const resetEntries = entries.map((e) => ({
      ...e,
      processedUrl: null,
      processedPreviewUrl: null,
      processedFilename: null,
      processedSize: null,
      status: "pending" as const,
      claimed: false,
      error: null,
    }));
    set({
      entries: resetEntries,
      batchZipBlob: null,
      batchZipFilename: null,
      batchZipClaimed: false,
      processing: false,
      error: null,
      activeJobId: null,
      cancelCurrentJob: null,
      lastSavedLibraryFileId: null,
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
      batchZipClaimed: false,
      processing: false,
      error: null,
      activeJobId: null,
      cancelCurrentJob: null,
      librarySaveMode: "new",
      lastSavedLibraryFileId: null,
      files: [],
      ...deriveSelected([], 0),
    });
  },
}));
