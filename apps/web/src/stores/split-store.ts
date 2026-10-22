import { create } from "zustand";
import { useFileStore } from "@/stores/file-store";

export type SplitMode = "grid" | "tile-size";

export interface TileInfo {
  row: number;
  col: number;
  label: string;
  width: number;
  height: number;
  blobUrl: string | null;
}

interface SplitState {
  // Split configuration
  mode: SplitMode;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  outputFormat: "original" | "png" | "jpg" | "webp" | "avif" | "jxl";
  quality: number;

  // Image dimensions (set when image loads in the canvas)
  imageDimensions: { width: number; height: number } | null;

  // Processing state
  processing: boolean;
  error: string | null;
  tiles: TileInfo[];
  /**
   * How many files the run that produced these tiles split. The tiles are the
   * first file's only, so with more than one they are not the whole run.
   * Recorded with the tiles rather than read off the file store later, which
   * can change while the settings panel (and its clearing effect) is unmounted.
   */
  runFileCount: number;
  zipBlobUrl: string | null;

  // Actions
  setMode: (mode: SplitMode) => void;
  setColumns: (n: number) => void;
  setRows: (n: number) => void;
  setTileWidth: (n: number) => void;
  setTileHeight: (n: number) => void;
  setOutputFormat: (f: "original" | "png" | "jpg" | "webp" | "avif" | "jxl") => void;
  setQuality: (q: number) => void;
  setImageDimensions: (d: { width: number; height: number } | null) => void;
  setProcessing: (p: boolean) => void;
  setError: (e: string | null) => void;
  setTiles: (tiles: TileInfo[], runFileCount?: number) => void;
  setZipBlobUrl: (url: string | null) => void;
  applyPreset: (cols: number, rows: number) => void;
  reset: () => void;

  // Derived helpers (computed in selectors)
  getEffectiveGrid: () => { columns: number; rows: number };
  getTileCount: () => number;
  getComputedTileDimensions: () => { width: number; height: number } | null;
}

let activeSplitAbort: (() => void) | null = null;
let splitRunId = 0;

export function beginSplitRun(abort: () => void): {
  isCurrent: () => boolean;
  end: () => void;
} {
  activeSplitAbort?.();
  const runId = ++splitRunId;
  activeSplitAbort = abort;
  return {
    isCurrent: () => runId === splitRunId,
    end: () => {
      if (activeSplitAbort === abort) activeSplitAbort = null;
    },
  };
}

function cancelActiveSplitRun(): void {
  splitRunId++;
  const abort = activeSplitAbort;
  activeSplitAbort = null;
  abort?.();
}

function revokeRemovedTileUrls(prevTiles: TileInfo[], nextTiles: TileInfo[] = []): void {
  const keep = new Set<string>();
  for (const t of nextTiles) {
    if (t.blobUrl) keep.add(t.blobUrl);
  }
  const revoked = new Set<string>();
  for (const t of prevTiles) {
    if (t.blobUrl && !keep.has(t.blobUrl) && !revoked.has(t.blobUrl)) {
      URL.revokeObjectURL(t.blobUrl);
      revoked.add(t.blobUrl);
    }
  }
}

function clearSplitResult(prev: Pick<SplitState, "tiles" | "zipBlobUrl">): {
  tiles: TileInfo[];
  runFileCount: number;
  zipBlobUrl: null;
  processing: false;
  error: null;
} {
  cancelActiveSplitRun();
  if (prev.zipBlobUrl) URL.revokeObjectURL(prev.zipBlobUrl);
  revokeRemovedTileUrls(prev.tiles);
  return { tiles: [], runFileCount: 0, zipBlobUrl: null, processing: false, error: null };
}

export const useSplitStore = create<SplitState>((set, get) => ({
  mode: "grid",
  columns: 3,
  rows: 3,
  tileWidth: 200,
  tileHeight: 200,
  outputFormat: "original",
  quality: 90,
  imageDimensions: null,
  processing: false,
  error: null,
  tiles: [],
  runFileCount: 0,
  zipBlobUrl: null,

  setMode: (mode) => set({ mode, ...clearSplitResult(get()) }),
  setColumns: (columns) =>
    set({ columns: Math.max(1, Math.min(100, columns)), ...clearSplitResult(get()) }),
  setRows: (rows) => set({ rows: Math.max(1, Math.min(100, rows)), ...clearSplitResult(get()) }),
  setTileWidth: (tileWidth) =>
    set({ tileWidth: Math.max(10, tileWidth), ...clearSplitResult(get()) }),
  setTileHeight: (tileHeight) =>
    set({ tileHeight: Math.max(10, tileHeight), ...clearSplitResult(get()) }),
  setOutputFormat: (outputFormat) => set({ outputFormat, ...clearSplitResult(get()) }),
  setQuality: (quality) => set({ quality, ...clearSplitResult(get()) }),
  setImageDimensions: (imageDimensions) => set({ imageDimensions }),
  setProcessing: (processing) => set({ processing }),
  setError: (error) => set({ error }),
  setTiles: (tiles, runFileCount = 0) => {
    revokeRemovedTileUrls(get().tiles, tiles);
    set({ tiles, runFileCount: tiles.length === 0 ? 0 : runFileCount });
  },
  setZipBlobUrl: (url) => {
    const prev = get().zipBlobUrl;
    if (prev && prev !== url) URL.revokeObjectURL(prev);
    set({ zipBlobUrl: url });
  },

  applyPreset: (cols, rows) =>
    set({ mode: "grid", columns: cols, rows, ...clearSplitResult(get()) }),

  reset: () => {
    set({
      ...clearSplitResult(get()),
      imageDimensions: null,
    });
  },

  getEffectiveGrid: () => {
    const { mode, columns, rows, tileWidth, tileHeight, imageDimensions } = get();
    if (mode === "tile-size" && imageDimensions) {
      return {
        columns: Math.max(1, Math.ceil(imageDimensions.width / tileWidth)),
        rows: Math.max(1, Math.ceil(imageDimensions.height / tileHeight)),
      };
    }
    return { columns, rows };
  },

  getTileCount: () => {
    const { columns, rows } = get().getEffectiveGrid();
    return columns * rows;
  },

  getComputedTileDimensions: () => {
    const { imageDimensions, mode, tileWidth, tileHeight } = get();
    if (!imageDimensions) return null;
    const { columns, rows } = get().getEffectiveGrid();
    if (mode === "tile-size") {
      return { width: tileWidth, height: tileHeight };
    }
    return {
      width: Math.floor(imageDimensions.width / columns),
      height: Math.floor(imageDimensions.height / rows),
    };
  },
}));

useFileStore.subscribe((state, prevState) => {
  if (prevState.files.length > 0 && state.files.length === 0) {
    useSplitStore.getState().reset();
  }
});
