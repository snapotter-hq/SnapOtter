import { en, type TranslationKeys } from "@snapotter/shared";
import { create } from "zustand";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";

interface CaptureResponse {
  downloadUrl: string;
  processedSize?: number | null;
}

function isCaptureResponse(value: unknown): value is CaptureResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.downloadUrl === "string" &&
    data.downloadUrl.length > 0 &&
    (data.processedSize === undefined ||
      data.processedSize === null ||
      (typeof data.processedSize === "number" &&
        Number.isFinite(data.processedSize) &&
        data.processedSize >= 0))
  );
}

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
  /** `t` words a failed answer (#1915); the store has no locale of its own. */
  capture: (t?: TranslationKeys) => Promise<void>;
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

let captureController: AbortController | null = null;
let captureRunId = 0;

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

  capture: async (t = en) => {
    const state = get();
    const hasInput = state.mode === "url" ? state.url : state.htmlContent;
    if (!hasInput || state.capturing) return;

    captureController?.abort();
    const controller = new AbortController();
    captureController = controller;
    const runId = ++captureRunId;
    const isCurrent = () => runId === captureRunId && !controller.signal.aborted;

    set({ capturing: true, error: null, resultUrl: null, resultSize: null });

    try {
      const res = await fetch(appUrl("/api/v1/tools/image/html-to-image"), {
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
        signal: controller.signal,
      });

      if (!res.ok) {
        // A proxy's error page is not JSON; it still ends on the fallback.
        const body = await res.json().catch(() => null);
        if (!isCurrent()) return;
        set({
          error: failedAnswerMessage(t, body, res.status, "Capture failed"),
          capturing: false,
        });
        return;
      }

      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isCurrent()) return;
      const data = resolveServerUrls(raw);
      if (!isCaptureResponse(data)) {
        throw new Error(t.errors.invalidServerResponse);
      }

      set({
        resultUrl: data.downloadUrl,
        resultSize: data.processedSize ?? null,
        capturing: false,
      });
    } catch (err) {
      if (!isCurrent() || (err instanceof DOMException && err.name === "AbortError")) return;
      set({
        error: err instanceof Error ? err.message : "Network error",
        capturing: false,
      });
    } finally {
      if (captureController === controller) captureController = null;
      if (isCurrent()) set({ capturing: false });
    }
  },

  reset: () => {
    captureRunId++;
    const controller = captureController;
    captureController = null;
    controller?.abort();
    set({ ...DEFAULTS });
  },
}));
