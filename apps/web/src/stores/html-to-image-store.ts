import { create } from "zustand";
import { formatHeaders } from "@/lib/api";

interface HtmlToImageState {
  mode: "url" | "html";
  url: string;
  htmlContent: string;
  format: "jpg" | "png" | "webp";
  quality: number;
  fullPage: boolean;
  devicePreset: "desktop" | "tablet" | "mobile" | "custom";
  viewportWidth: number;
  viewportHeight: number;
  capturing: boolean;
  resultUrl: string | null;
  resultSize: number | null;
  error: string | null;

  setMode: (mode: "url" | "html") => void;
  setUrl: (url: string) => void;
  setHtmlContent: (html: string) => void;
  setFormat: (format: "jpg" | "png" | "webp") => void;
  setQuality: (quality: number) => void;
  setFullPage: (fullPage: boolean) => void;
  setDevicePreset: (preset: "desktop" | "tablet" | "mobile" | "custom") => void;
  setViewportWidth: (width: number) => void;
  setViewportHeight: (height: number) => void;
  capture: () => Promise<void>;
  reset: () => void;
}

const DEFAULTS = {
  mode: "url" as const,
  url: "",
  htmlContent: "",
  format: "png" as const,
  quality: 90,
  fullPage: false,
  devicePreset: "desktop" as const,
  viewportWidth: 1280,
  viewportHeight: 720,
  capturing: false,
  resultUrl: null as string | null,
  resultSize: null as number | null,
  error: null as string | null,
};

export const useHtmlToImageStore = create<HtmlToImageState>((set, get) => ({
  ...DEFAULTS,

  setMode: (mode) => set({ mode, error: null }),
  setUrl: (url) => set({ url, error: null }),
  setHtmlContent: (htmlContent) => set({ htmlContent, error: null }),
  setFormat: (format) => set({ format }),
  setQuality: (quality) => set({ quality }),
  setFullPage: (fullPage) => set({ fullPage }),
  setDevicePreset: (devicePreset) => set({ devicePreset }),
  setViewportWidth: (viewportWidth) => set({ viewportWidth }),
  setViewportHeight: (viewportHeight) => set({ viewportHeight }),

  capture: async () => {
    const state = get();
    const hasInput = state.mode === "url" ? state.url : state.htmlContent;
    if (!hasInput || state.capturing) return;

    set({ capturing: true, error: null, resultUrl: null, resultSize: null });

    try {
      const res = await fetch("/api/v1/tools/image/html-to-image", {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...(state.mode === "url" ? { url: state.url } : { html: state.htmlContent }),
          format: state.format,
          quality: state.quality,
          fullPage: state.fullPage,
          devicePreset: state.devicePreset,
          viewportWidth: state.viewportWidth,
          viewportHeight: state.viewportHeight,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        set({
          error: data.details || data.error || "Capture failed",
          capturing: false,
        });
        return;
      }

      set({
        resultUrl: data.downloadUrl,
        resultSize: data.processedSize,
        capturing: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Network error",
        capturing: false,
      });
    }
  },

  reset: () => set({ ...DEFAULTS }),
}));
