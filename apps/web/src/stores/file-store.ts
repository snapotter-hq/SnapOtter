import type { FeedbackErrorCategory } from "@snapotter/shared";
import {
  ANALYTICS_EVENTS,
  detectModalityFromMime,
  type LibrarySaveMode,
  type Modality,
  TOOLS,
} from "@snapotter/shared";
import { create } from "zustand";
import { track } from "@/lib/analytics";
import { BASE_PATH } from "@/lib/app-url";
import { fetchDecodedPreview, needsServerPreview, revokePreviewUrl } from "@/lib/image-preview";

const TOOL_IDS_BY_ROUTE = new Map<string, string>(TOOLS.map((t) => [t.route, t.id]));

function activeToolIdFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.location?.pathname ?? "";
  const path = BASE_PATH && raw.startsWith(`${BASE_PATH}/`) ? raw.slice(BASE_PATH.length) : raw;
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1).toLowerCase() : path.toLowerCase();
  return TOOL_IDS_BY_ROUTE.get(normalized);
}

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

/**
 * `useToolProcessor` and `usePipelineProcessor` write `"Canceled"` to
 * `error` and `entry.error` as a cancellation sentinel. Translate that
 * sentinel at the display boundary while keeping the raw store value intact.
 */
export function displayStoredError(
  error: string | null | undefined,
  canceledLabel: string,
): string | null {
  if (error == null) return null;
  return error === "Canceled" ? canceledLabel : error;
}

/**
 * What the server said about one result beyond the file itself (#1292): compress
 * scaled the image down to fit (resizedTo), and the target-size verdict from
 * compress and compress-pdf (targetKb, targetMet). Set per file by single runs
 * and by batches alike, so a panel or the thumbnail strip can speak for the
 * file on screen rather than for whichever run happened last.
 */
export interface ResultNotes {
  resizedTo?: { width: number; height: number };
  targetKb?: number;
  targetMet?: boolean;
  /** Image Enhancement's requested Deep Enhance pass didn't run, and why (#1303). */
  deepEnhanceSkipped?: "failed" | "unavailable" | "animated";
  /** Chart Maker left rows out because their value wasn't a number (#2060). */
  chartRows?: { charted: number; skipped: number };
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
  /** Notes on this entry's result; null when it has none or no result. */
  resultNotes: ResultNotes | null;
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
  /**
   * The feedback category of `error`, when the code that set it knew the
   * cause. The message may be translated, so it can't be classified from the
   * text (#1596). Any patch that sets `error` without a category clears it, so
   * a re-run can't inherit the last failure's category.
   */
  errorCategory?: FeedbackErrorCategory | null;
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
    resultNotes: null,
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
  /**
   * The server's machine-readable code for `error` (NO_TEXT_LAYER), when the
   * failure carried one. `error` is prose and may be translated, so a panel
   * deciding what to offer next can't read it from the text. Only meaningful
   * while `error` is set.
   */
  errorCode: string | null;
  activeJobId: string | null;
  /**
   * Rejects with a CancelRefusedError when the server won't cancel or never
   * answered (#1815), and with the hook's own error when its teardown breaks
   * (#1779). Every caller must catch.
   */
  cancelCurrentJob: (() => Promise<void>) | null;
  /** How library-sourced results are saved (#495): "new" keeps the original. */
  librarySaveMode: LibrarySaveMode;
  /** Library file id of the last run's auto-saved result, for the review UI. */
  lastSavedLibraryFileId: string | null;
  /**
   * Bumped whenever the tool route leaves (`stopRuns`), so runs that survive a
   * panel unmount (mobile sheet close or breakpoint swap) still stop when the
   * user leaves the tool, even if the next route keeps the files (#1994).
   */
  stopCount: number;

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
  updateEntryById: (id: string, patch: Omit<Partial<FileEntry>, "claimed">) => void;
  setBatchZip: (blob: Blob, filename: string) => void;
  clearBatchZip: () => void;
  /** Index is required: selectedIndex can change while a job runs. */
  markClaimed: (index: number) => void;
  markClaimedById: (id: string, expectedProcessedUrl?: string) => void;
  markBatchClaimed: () => void;
  /** Claim the entry the UI is currently showing. Safe only from synchronous
   *  handlers: across an await the selection or order can move, so capture the
   *  entry's id first and use markClaimedById instead. */
  claimSelected: () => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null, code?: string) => void;
  setActiveJob: (id: string | null, cancelFn: (() => Promise<void>) | null) => void;
  setLibrarySaveMode: (mode: LibrarySaveMode) => void;
  setLastSavedLibraryFileId: (id: string | null) => void;
  setJobId: (id: string) => void;
  setProcessedUrl: (url: string | null, previewUrl?: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  undoProcessing: () => void;
  stopRuns: () => void;
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
  errorCode: null,
  activeJobId: null,
  cancelCurrentJob: null,
  librarySaveMode: "new",
  lastSavedLibraryFileId: null,
  stopCount: 0,

  // Initial derived values (empty state)
  files: [],
  ...deriveSelected([], 0),

  // -- Actions --------------------------------------------------------------

  setFiles: (files) => {
    const toolId = activeToolIdFromLocation();
    track(ANALYTICS_EVENTS.FILE_ADDED, {
      ...(toolId ? { tool_id: toolId } : {}),
      file_count: files.length,
    });
    revokeEntries(get().entries);
    const entries = files.map(createEntry);
    set({
      entries,
      selectedIndex: 0,
      processing: false,
      error: null,
      activeJobId: null,
      cancelCurrentJob: null,
      // The previous run's zip describes files that are no longer loaded.
      batchZipBlob: null,
      batchZipFilename: null,
      batchZipClaimed: false,
      // A fresh file set is a fresh edit: the save-mode choice made for a
      // previous file must not carry over (#495 defaults to non-destructive).
      librarySaveMode: "new",
      lastSavedLibraryFileId: null,
      files: deriveFiles(entries),
      ...deriveSelected(entries, 0),
    });
    // Async: decode HEIC/HEIF files for browser preview
    for (let i = 0; i < entries.length; i++) {
      if (needsServerPreview(entries[i].file)) {
        const entryId = entries[i].id;
        const file = entries[i].file;
        fetchDecodedPreview(file).then((result) => {
          const state = get();
          const idx = state.entries.findIndex((e) => e.id === entryId && e.file === file);
          if (idx === -1) {
            if (result?.url) revokePreviewUrl(result.url);
            return;
          }
          const updated = [...state.entries];
          const oldBlobUrl = updated[idx].blobUrl;
          updated[idx] = {
            ...updated[idx],
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
    const toolId = activeToolIdFromLocation();
    track(ANALYTICS_EVENTS.FILE_ADDED, {
      ...(toolId ? { tool_id: toolId } : {}),
      file_count: files.length,
    });
    const newEntries = files.map(createEntry);
    const entries = [...get().entries, ...newEntries];
    const idx = get().selectedIndex;
    set({
      entries,
      // Adding files means the previous batch zip no longer matches the file set (#1806).
      ...(newEntries.length > 0
        ? {
            batchZipBlob: null,
            batchZipFilename: null,
            batchZipClaimed: false,
          }
        : {}),
      files: deriveFiles(entries),
      ...deriveSelected(entries, idx),
    });
    // Async: decode HEIC/HEIF files for browser preview
    for (let j = 0; j < newEntries.length; j++) {
      if (needsServerPreview(newEntries[j].file)) {
        const entryId = newEntries[j].id;
        const file = newEntries[j].file;
        fetchDecodedPreview(file).then((result) => {
          const state = get();
          const foundIdx = state.entries.findIndex((e) => e.id === entryId && e.file === file);
          if (foundIdx === -1) {
            if (result?.url) revokePreviewUrl(result.url);
            return;
          }
          const updated = [...state.entries];
          const oldBlobUrl = updated[foundIdx].blobUrl;
          updated[foundIdx] = {
            ...updated[foundIdx],
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
      // Removing a file means the previous batch zip no longer matches the file set (#1806).
      batchZipBlob: null,
      batchZipFilename: null,
      batchZipClaimed: false,
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
    // Same shape for the error's category; see `errorCategory` on FileEntry.
    const categoryReset =
      "error" in patch && !("errorCategory" in patch) ? { errorCategory: null } : null;
    entries[index] = { ...entries[index], ...patch, ...claimReset, ...categoryReset };
    const idx = get().selectedIndex;
    set({ entries, files: deriveFiles(entries), ...deriveSelected(entries, idx) });
  },

  updateEntryById: (id, patch) => {
    const index = get().entries.findIndex((e) => e.id === id);
    if (index !== -1) get().updateEntry(index, patch);
  },

  setBatchZip: (blob, filename) =>
    set({ batchZipBlob: blob, batchZipFilename: filename, batchZipClaimed: false }),

  clearBatchZip: () => set({ batchZipBlob: null, batchZipFilename: null, batchZipClaimed: false }),

  markClaimed: (index) => {
    const { entries, selectedIndex } = get();
    if (!entries[index] || entries[index].claimed) return;
    const next = [...entries];
    next[index] = { ...next[index], claimed: true };
    set({ entries: next, files: deriveFiles(next), ...deriveSelected(next, selectedIndex) });
  },

  markClaimedById: (id, expectedProcessedUrl) => {
    const { entries } = get();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    if (
      expectedProcessedUrl !== undefined &&
      entries[index].processedUrl !== expectedProcessedUrl
    ) {
      return;
    }
    get().markClaimed(index);
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

  // Synchronous handlers only; see the declaration above for why.
  claimSelected: () => get().markClaimed(get().selectedIndex),

  setProcessing: (v) => set({ processing: v }),

  setError: (e, code) =>
    set(
      e
        ? { error: e, errorCode: code ?? null, processing: false }
        : { error: null, errorCode: null },
    ),

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
        processedSize: null,
        resultNotes: null,
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
      resultNotes: null,
      status: "pending" as const,
      claimed: false,
      error: null,
      errorCategory: null,
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

  stopRuns: () => set((state) => ({ stopCount: state.stopCount + 1 })),

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
