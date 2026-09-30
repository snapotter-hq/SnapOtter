import { create } from "zustand";

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

  setMode: (mode) => set({ mode, tiles: [], zipBlobUrl: null, error: null }),
  setColumns: (columns) =>
    set({ columns: Math.max(1, Math.min(100, columns)), tiles: [], zipBlobUrl: null }),
  setRows: (rows) => set({ rows: Math.max(1, Math.min(100, rows)), tiles: [], zipBlobUrl: null }),
  setTileWidth: (tileWidth) =>
    set({ tileWidth: Math.max(10, tileWidth), tiles: [], zipBlobUrl: null }),
  setTileHeight: (tileHeight) =>
    set({ tileHeight: Math.max(10, tileHeight), tiles: [], zipBlobUrl: null }),
  setOutputFormat: (outputFormat) => set({ outputFormat }),
  setQuality: (quality) => set({ quality }),
  setImageDimensions: (imageDimensions) => set({ imageDimensions }),
  setProcessing: (processing) => set({ processing }),
  setError: (error) => set({ error }),
  setTiles: (tiles, runFileCount = 0) => set({ tiles, runFileCount }),
  setZipBlobUrl: (url) => {
    const prev = get().zipBlobUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ zipBlobUrl: url });
  },

  applyPreset: (cols, rows) =>
    set({ mode: "grid", columns: cols, rows, tiles: [], zipBlobUrl: null, error: null }),

  reset: () => {
    const prev = get();
    if (prev.zipBlobUrl) URL.revokeObjectURL(prev.zipBlobUrl);
    for (const t of prev.tiles) {
      if (t.blobUrl) URL.revokeObjectURL(t.blobUrl);
    }
    set({
      tiles: [],
      runFileCount: 0,
      zipBlobUrl: null,
      processing: false,
      error: null,
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
