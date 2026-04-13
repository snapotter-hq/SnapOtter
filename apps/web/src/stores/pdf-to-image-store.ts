import { create } from "zustand";
import { formatHeaders } from "@/lib/api";

interface PageResult {
  page: number;
  downloadUrl: string;
  size: number;
}

interface Thumbnail {
  page: number;
  dataUrl: string;
  width: number;
  height: number;
}

type ColorMode = "color" | "grayscale" | "bw";

interface PdfToImageState {
  file: File | null;
  pageCount: number | null;
  thumbnails: Thumbnail[];
  format: string;
  dpi: number;
  customDpi: boolean;
  quality: number;
  colorMode: ColorMode;
  pages: string;
  selectedPages: Set<number>;
  processing: boolean;
  loadingPreview: boolean;
  error: string | null;
  results: PageResult[] | null;
  zipUrl: string | null;
  zipSize: number | null;
  setFormat: (format: string) => void;
  setDpi: (dpi: number) => void;
  setCustomDpi: (custom: boolean) => void;
  setQuality: (quality: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setPages: (pages: string) => void;
  setFile: (file: File | null) => void;
  togglePage: (page: number) => void;
  selectAllPages: () => void;
  deselectAllPages: () => void;
  loadPreview: (file: File) => Promise<void>;
  convert: () => Promise<void>;
  reset: () => void;
}

/**
 * Compress a set of page numbers into a compact range string.
 * e.g. {1,2,3,5,7,8,9} -> "1-3, 5, 7-9"
 */
function compressPageRange(pages: Set<number>, totalPages: number): string {
  if (pages.size === 0 || pages.size === totalPages) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}

/**
 * Parse a page range string into a Set of page numbers.
 * Returns null if the string is invalid.
 */
function parsePageRangeToSet(input: string, totalPages: number): Set<number> | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "all") {
    return new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
  }
  try {
    const pages = new Set<number>();
    for (const seg of trimmed.split(",")) {
      const s = seg.trim();
      if (s === "") continue;
      if (s.includes("-")) {
        const [a, b] = s.split("-").map((x) => Number(x.trim()));
        if (Number.isNaN(a) || Number.isNaN(b) || a < 1 || b < 1 || a > b) return null;
        for (let i = a; i <= Math.min(b, totalPages); i++) pages.add(i);
      } else {
        const n = Number(s);
        if (Number.isNaN(n) || n < 1 || n > totalPages) return null;
        pages.add(n);
      }
    }
    return pages.size > 0 ? pages : null;
  } catch {
    return null;
  }
}

const initialState = {
  file: null as File | null,
  pageCount: null as number | null,
  thumbnails: [] as Thumbnail[],
  format: "png",
  dpi: 150,
  customDpi: false,
  quality: 85,
  colorMode: "color" as ColorMode,
  pages: "",
  selectedPages: new Set<number>(),
  processing: false,
  loadingPreview: false,
  error: null as string | null,
  results: null as PageResult[] | null,
  zipUrl: null as string | null,
  zipSize: null as number | null,
};

export const usePdfToImageStore = create<PdfToImageState>((set, get) => ({
  ...initialState,

  setFormat: (format) => set({ format }),
  setDpi: (dpi) => set({ dpi }),
  setCustomDpi: (customDpi) => set({ customDpi }),
  setQuality: (quality) => set({ quality }),
  setColorMode: (colorMode) => set({ colorMode }),

  setPages: (pages) => {
    const { pageCount } = get();
    const parsed = pageCount ? parsePageRangeToSet(pages, pageCount) : null;
    set({
      pages,
      selectedPages: parsed ?? new Set(Array.from({ length: pageCount ?? 0 }, (_, i) => i + 1)),
    });
  },

  setFile: (file) => {
    if (!file) {
      set({ ...initialState });
      return;
    }
    set({
      file,
      pageCount: null,
      thumbnails: [],
      results: null,
      zipUrl: null,
      zipSize: null,
      error: null,
      selectedPages: new Set<number>(),
      pages: "",
    });
  },

  togglePage: (page) => {
    const { selectedPages, pageCount } = get();
    const next = new Set(selectedPages);
    if (next.has(page)) {
      next.delete(page);
    } else {
      next.add(page);
    }
    set({
      selectedPages: next,
      pages: compressPageRange(next, pageCount ?? 0),
    });
  },

  selectAllPages: () => {
    const { pageCount } = get();
    if (!pageCount) return;
    set({
      selectedPages: new Set(Array.from({ length: pageCount }, (_, i) => i + 1)),
      pages: "",
    });
  },

  deselectAllPages: () => {
    set({ selectedPages: new Set<number>(), pages: "none" });
  },

  loadPreview: async (file) => {
    set({ loadingPreview: true, error: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/tools/pdf-to-image/preview", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      const data = await res.json();
      set({
        pageCount: data.pageCount,
        thumbnails: data.thumbnails,
        selectedPages: new Set(Array.from({ length: data.pageCount }, (_, i) => i + 1)),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to read PDF",
        file: null,
        pageCount: null,
        thumbnails: [],
      });
    } finally {
      set({ loadingPreview: false });
    }
  },

  convert: async () => {
    const { file, format, dpi, quality, colorMode, pages, selectedPages } = get();
    if (!file) return;
    set({ processing: true, error: null, results: null, zipUrl: null, zipSize: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const pagesValue =
        pages.trim() === "" || pages.trim().toLowerCase() === "all"
          ? "all"
          : compressPageRange(selectedPages, get().pageCount ?? 0) || "all";
      formData.append(
        "settings",
        JSON.stringify({ format, dpi, quality, colorMode, pages: pagesValue }),
      );
      const res = await fetch("/api/v1/tools/pdf-to-image", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Conversion failed: ${res.status}`);
      }
      const data = await res.json();
      set({ results: data.pages, zipUrl: data.zipUrl, zipSize: data.zipSize });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Conversion failed",
      });
    } finally {
      set({ processing: false });
    }
  },

  reset: () => set({ ...initialState }),
}));
