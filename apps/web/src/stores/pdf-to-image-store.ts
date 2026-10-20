import { en, type TranslationKeys } from "@snapotter/shared";
import { create } from "zustand";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { useFileStore } from "@/stores/file-store";

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export interface PageResult {
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

interface PreviewResponse {
  pageCount: number;
  thumbnails: Thumbnail[];
}

interface ConvertResponse {
  pages: PageResult[];
  zipUrl?: string | null;
  zipSize?: number | null;
}

function isThumbnail(value: unknown): value is Thumbnail {
  if (!value || typeof value !== "object") return false;
  const thumb = value as Record<string, unknown>;
  return (
    typeof thumb.page === "number" &&
    Number.isInteger(thumb.page) &&
    thumb.page >= 1 &&
    typeof thumb.dataUrl === "string" &&
    thumb.dataUrl.length > 0
  );
}

function isPreviewResponse(value: unknown): value is PreviewResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.pageCount === "number" &&
    Number.isInteger(data.pageCount) &&
    data.pageCount >= 1 &&
    Array.isArray(data.thumbnails) &&
    data.thumbnails.every(isThumbnail)
  );
}

function isPageResult(value: unknown): value is PageResult {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.page === "number" &&
    Number.isInteger(page.page) &&
    page.page >= 1 &&
    typeof page.downloadUrl === "string" &&
    page.downloadUrl.length > 0 &&
    typeof page.size === "number" &&
    Number.isFinite(page.size) &&
    page.size >= 0
  );
}

function isConvertResponse(value: unknown): value is ConvertResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.pages) &&
    data.pages.length > 0 &&
    data.pages.every(isPageResult) &&
    (data.zipUrl === undefined ||
      data.zipUrl === null ||
      (typeof data.zipUrl === "string" && data.zipUrl.length > 0)) &&
    (data.zipSize === undefined ||
      data.zipSize === null ||
      (typeof data.zipSize === "number" && Number.isFinite(data.zipSize) && data.zipSize >= 0))
  );
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
  /** `t` words a failed answer (#1915); the store has no locale of its own. */
  loadPreview: (file: File, t?: TranslationKeys) => Promise<void>;
  convert: (t?: TranslationKeys) => Promise<void>;
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

function emptyFileState() {
  return {
    file: null as File | null,
    pageCount: null as number | null,
    thumbnails: [] as Thumbnail[],
    results: null as PageResult[] | null,
    zipUrl: null as string | null,
    zipSize: null as number | null,
    error: null as string | null,
    loadingPreview: false,
    processing: false,
    selectedPages: new Set<number>(),
    pages: "",
  };
}

const initialState = {
  ...emptyFileState(),
  format: "png",
  dpi: 150,
  customDpi: false,
  quality: 85,
  colorMode: "color" as ColorMode,
};

/** Counts loadPreview and convert calls so only the newest one writes its outcome. */
let latestPreviewRequest = 0;
let previewController: AbortController | null = null;
let latestConvertRequest = 0;
let convertController: AbortController | null = null;
let fileStoreUnsubscribe: (() => void) | null = null;

function stopWatchingFileStore() {
  const unsub = fileStoreUnsubscribe;
  fileStoreUnsubscribe = null;
  unsub?.();
}

function cancelActiveRequests() {
  latestPreviewRequest++;
  latestConvertRequest++;
  const pCtrl = previewController;
  const cCtrl = convertController;
  previewController = null;
  convertController = null;
  pCtrl?.abort();
  cCtrl?.abort();
}

function watchFileInStore(file: File, onLeavePdf: () => void, onSwitchPdf: () => void) {
  stopWatchingFileStore();
  const initial = useFileStore.getState();
  if (initial.entries[initial.selectedIndex]?.file !== file) return;
  let watchedFile: File = file;
  fileStoreUnsubscribe = useFileStore.subscribe((state) => {
    const current = state.entries[state.selectedIndex]?.file;
    if (current === watchedFile) return;
    cancelActiveRequests();
    if (!current || !isPdfFile(current)) {
      stopWatchingFileStore();
      onLeavePdf();
      return;
    }
    watchedFile = current;
    onSwitchPdf();
  });
}

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
    cancelActiveRequests();
    if (!file) {
      stopWatchingFileStore();
      set({ ...initialState });
      return;
    }
    watchFileInStore(
      file,
      () => get().reset(),
      () => set(emptyFileState()),
    );
    set({
      ...emptyFileState(),
      file,
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

  loadPreview: async (file, t = en) => {
    watchFileInStore(
      file,
      () => get().reset(),
      () => set(emptyFileState()),
    );
    previewController?.abort();
    const controller = new AbortController();
    previewController = controller;
    const request = ++latestPreviewRequest;
    // A slower answer for a file the viewer has since moved off must not
    // overwrite the newer request's pages, error, or spinner.
    const isLatest = () => request === latestPreviewRequest && !controller.signal.aborted;
    set({ loadingPreview: true, error: null });
    let data: PreviewResponse;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(appUrl("/api/v1/tools/pdf/pdf-to-image/preview"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(failedAnswerMessage(t, body, res.status, `Failed: ${res.status}`));
      }
      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isLatest()) return;
      const resolved = resolveServerUrls(raw);
      if (!isPreviewResponse(resolved)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      data = resolved;
    } catch (err) {
      if (!isLatest() || (err instanceof DOMException && err.name === "AbortError")) return;
      // `file` stays: the panel asks for a preview whenever the selected file
      // differs from it, so clearing it here asked again on every render
      // (#1954). A null pageCount keeps Convert disabled.
      set({
        error: err instanceof Error ? err.message : "Failed to read PDF",
        pageCount: null,
        thumbnails: [],
        selectedPages: new Set(),
        loadingPreview: false,
      });
      return;
    } finally {
      if (previewController === controller) previewController = null;
    }
    set({
      pageCount: data.pageCount,
      thumbnails: data.thumbnails,
      selectedPages: new Set(Array.from({ length: data.pageCount }, (_, i) => i + 1)),
      loadingPreview: false,
    });
  },

  convert: async (t = en) => {
    const { file, format, dpi, quality, colorMode, pages, selectedPages } = get();
    if (!file) return;
    watchFileInStore(
      file,
      () => get().reset(),
      () => set(emptyFileState()),
    );
    convertController?.abort();
    const controller = new AbortController();
    convertController = controller;
    const request = ++latestConvertRequest;
    const isLatest = () => request === latestConvertRequest && !controller.signal.aborted;
    set({ processing: true, error: null, results: null, zipUrl: null, zipSize: null });
    let data: ConvertResponse;
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
      const res = await fetch(appUrl("/api/v1/tools/pdf/pdf-to-image"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          failedAnswerMessage(t, body, res.status, `Conversion failed: ${res.status}`),
        );
      }
      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isLatest()) return;
      const resolved = resolveServerUrls(raw);
      if (!isConvertResponse(resolved)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      data = resolved;
    } catch (err) {
      if (!isLatest() || (err instanceof DOMException && err.name === "AbortError")) return;
      set({
        error: err instanceof Error ? err.message : "Conversion failed",
        processing: false,
      });
      return;
    } finally {
      if (convertController === controller) convertController = null;
    }
    set({
      results: data.pages,
      zipUrl: data.zipUrl ?? null,
      zipSize: data.zipSize ?? null,
      processing: false,
    });
  },

  reset: () => {
    stopWatchingFileStore();
    cancelActiveRequests();
    set({ ...initialState });
  },
}));
