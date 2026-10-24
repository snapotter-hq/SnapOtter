import { ANALYTICS_EVENTS, en, type TranslationKeys } from "@snapotter/shared";
import { create } from "zustand";
import { track } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";

// ── Types ────────────────────────────────────────────────────────────

export interface TemplateTextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultText?: string;
}

export interface MemeTemplate {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  category: string;
  filename: string;
  width: number;
  height: number;
  popularity: number;
  textBoxes: TemplateTextBox[];
}

interface TemplateManifest {
  version: number;
  categories: string[];
  templates: MemeTemplate[];
}

function isTemplateTextBox(value: unknown): value is TemplateTextBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Record<string, unknown>;
  return (
    typeof box.id === "string" &&
    box.id.length > 0 &&
    typeof box.x === "number" &&
    Number.isFinite(box.x) &&
    typeof box.y === "number" &&
    Number.isFinite(box.y) &&
    typeof box.width === "number" &&
    Number.isFinite(box.width) &&
    typeof box.height === "number" &&
    Number.isFinite(box.height) &&
    (box.defaultText === undefined || typeof box.defaultText === "string")
  );
}

function isMemeTemplate(value: unknown): value is MemeTemplate {
  if (!value || typeof value !== "object") return false;
  const tpl = value as Record<string, unknown>;
  return (
    typeof tpl.id === "string" &&
    tpl.id.length > 0 &&
    typeof tpl.name === "string" &&
    tpl.name.length > 0 &&
    typeof tpl.category === "string" &&
    tpl.category.length > 0 &&
    typeof tpl.filename === "string" &&
    tpl.filename.length > 0 &&
    Array.isArray(tpl.aliases) &&
    tpl.aliases.every((a) => typeof a === "string") &&
    Array.isArray(tpl.tags) &&
    tpl.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(tpl.textBoxes) &&
    tpl.textBoxes.every(isTemplateTextBox)
  );
}

function isTemplateManifest(value: unknown): value is TemplateManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.templates) &&
    data.templates.length > 0 &&
    data.templates.every(isMemeTemplate)
  );
}

function isMemeGenerateResponse(value: unknown): value is { downloadUrl: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.downloadUrl === "string" && data.downloadUrl.length > 0;
}

export type Phase = "gallery" | "layout-picker" | "editor" | "result";
export type TextLayout = "top-bottom" | "top-only" | "bottom-only" | "center" | "side-by-side";

export interface TextBoxValue {
  id: string;
  text: string;
}

// ── Constants ────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
  { value: "anton", label: "Anton" },
  { value: "arial-black", label: "Arial Black" },
  { value: "comic-sans", label: "Comic Sans" },
  { value: "montserrat", label: "Montserrat" },
  { value: "bebas-neue", label: "Bebas Neue" },
  { value: "permanent-marker", label: "Permanent Marker" },
  { value: "roboto", label: "Roboto Black" },
] as const;

export const FONT_FAMILY_MAP: Record<string, string> = {
  anton: "'Anton', 'Impact', sans-serif",
  "arial-black": "'Arial Black', 'Anton', sans-serif",
  "comic-sans": "'Comic Sans MS', cursive",
  montserrat: "'Montserrat Black', 'Anton', sans-serif",
  "bebas-neue": "'Bebas Neue', 'Anton', sans-serif",
  "permanent-marker": "'Permanent Marker', cursive",
  roboto: "'Roboto Black', 'Anton', sans-serif",
};

export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "reaction", label: "Reaction" },
  { id: "comparison", label: "Comparison" },
  { id: "opinion", label: "Opinion" },
  { id: "animals", label: "Animals" },
  { id: "classic", label: "Classic" },
];

export const PRESET_LAYOUTS: Record<
  TextLayout,
  { label: string; description: string; boxes: TemplateTextBox[] }
> = {
  "top-bottom": {
    label: "Top + Bottom",
    description: "Classic meme layout",
    boxes: [
      { id: "top", x: 5, y: 2, width: 90, height: 20, defaultText: "Top text" },
      { id: "bottom", x: 5, y: 78, width: 90, height: 20, defaultText: "Bottom text" },
    ],
  },
  "top-only": {
    label: "Top Only",
    description: "Text at the top",
    boxes: [{ id: "top", x: 5, y: 2, width: 90, height: 25, defaultText: "Top text" }],
  },
  "bottom-only": {
    label: "Bottom Only",
    description: "Text at the bottom",
    boxes: [{ id: "bottom", x: 5, y: 75, width: 90, height: 23, defaultText: "Bottom text" }],
  },
  center: {
    label: "Center",
    description: "Text in the middle",
    boxes: [{ id: "center", x: 10, y: 35, width: 80, height: 30, defaultText: "Center text" }],
  },
  "side-by-side": {
    label: "Side by Side",
    description: "Left and right text",
    boxes: [
      { id: "left", x: 2, y: 35, width: 46, height: 30, defaultText: "Left text" },
      { id: "right", x: 52, y: 35, width: 46, height: 30, defaultText: "Right text" },
    ],
  },
};

// ── Font loading ─────────────────────────────────────────────────────

const FONT_FACES = [
  { family: "Anton", file: "Anton-Regular.ttf" },
  { family: "Bebas Neue", file: "BebasNeue-Regular.ttf" },
  { family: "Permanent Marker", file: "PermanentMarker-Regular.ttf" },
  { family: "Montserrat Black", file: "Montserrat-Black.ttf" },
  { family: "Roboto Black", file: "Roboto-Black.ttf" },
];

let fontsInjected = false;

export function injectMemeFonts() {
  if (fontsInjected) return;
  const id = "meme-generator-fonts";
  if (document.getElementById(id)) {
    fontsInjected = true;
    return;
  }

  const css = FONT_FACES.map(
    (f) =>
      `@font-face { font-family: '${f.family}'; src: url('${appUrl(`/api/v1/meme-templates/fonts/${f.file}`)}') format('truetype'); font-display: swap; }`,
  ).join("\n");

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  fontsInjected = true;
}

// ── Store ────────────────────────────────────────────────────────────

interface MemeState {
  // Phase
  phase: Phase;

  // Templates
  templates: MemeTemplate[];
  loading: boolean;
  searchQuery: string;
  activeCategory: string;

  // Selected template
  selectedTemplate: MemeTemplate | null;

  // Custom image
  customFile: File | null;
  customImageUrl: string | null;
  customLayout: TextLayout | null;

  // Editor settings
  textBoxValues: TextBoxValue[];
  fontFamily: string;
  fontSize: number; // 0 = auto
  textColor: string;
  strokeColor: string;
  textAlign: string;
  allCaps: boolean;

  // Processing / result
  generating: boolean;
  resultUrl: string | null;
  downloadUrl: string | null;
  error: string | null;

  // Actions
  setPhase: (phase: Phase) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (c: string) => void;
  selectTemplate: (t: MemeTemplate) => void;
  setCustomImage: (file: File) => void;
  setCustomLayout: (layout: TextLayout) => void;
  updateTextValue: (id: string, text: string) => void;
  setFontFamily: (f: string) => void;
  setFontSize: (s: number) => void;
  setTextColor: (c: string) => void;
  setStrokeColor: (c: string) => void;
  setTextAlign: (a: string) => void;
  setAllCaps: (v: boolean) => void;
  fetchTemplates: (t?: TranslationKeys) => Promise<void>;
  /** `t` words a failed answer (#1915); the store has no locale of its own. */
  generateMeme: (t?: TranslationKeys) => Promise<void>;
  backToGallery: () => void;
  backToEditor: () => void;
  reset: () => void;
}

let templatesController: AbortController | null = null;
let templatesRunId = 0;
let generateController: AbortController | null = null;
let generateRunId = 0;

function cancelActiveTemplates() {
  templatesRunId++;
  const controller = templatesController;
  templatesController = null;
  controller?.abort();
}

function cancelActiveGeneration() {
  generateRunId++;
  const controller = generateController;
  generateController = null;
  controller?.abort();
}

export const useMemeStore = create<MemeState>((set, get) => ({
  phase: "gallery",
  templates: [],
  loading: true,
  searchQuery: "",
  activeCategory: "all",
  selectedTemplate: null,
  customFile: null,
  customImageUrl: null,
  customLayout: null,
  textBoxValues: [],
  fontFamily: "anton",
  fontSize: 0,
  textColor: "#ffffff",
  strokeColor: "#000000",
  textAlign: "center",
  allCaps: true,
  generating: false,
  resultUrl: null,
  downloadUrl: null,
  error: null,

  setPhase: (phase) => set({ phase }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveCategory: (c) => set({ activeCategory: c }),

  selectTemplate: (t) => {
    cancelActiveGeneration();
    const oldUrl = get().customImageUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    set({
      selectedTemplate: t,
      customFile: null,
      customImageUrl: null,
      customLayout: null,
      textBoxValues: t.textBoxes.map((b) => ({ id: b.id, text: "" })),
      resultUrl: null,
      downloadUrl: null,
      error: null,
      generating: false,
      phase: "editor",
    });
  },

  setCustomImage: (file) => {
    cancelActiveGeneration();
    const oldUrl = get().customImageUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    set({
      customFile: file,
      customImageUrl: URL.createObjectURL(file),
      selectedTemplate: null,
      resultUrl: null,
      downloadUrl: null,
      error: null,
      generating: false,
      phase: "layout-picker",
    });
  },

  setCustomLayout: (layout) => {
    const boxes = PRESET_LAYOUTS[layout]?.boxes ?? PRESET_LAYOUTS["top-bottom"].boxes;
    set({
      customLayout: layout,
      textBoxValues: boxes.map((b) => ({ id: b.id, text: "" })),
      phase: "editor",
    });
  },

  updateTextValue: (id, text) => {
    const values = get().textBoxValues.map((v) => (v.id === id ? { ...v, text } : v));
    set({ textBoxValues: values });
  },

  setFontFamily: (f) => set({ fontFamily: f }),
  setFontSize: (s) => set({ fontSize: s }),
  setTextColor: (c) => set({ textColor: c }),
  setStrokeColor: (c) => set({ strokeColor: c }),
  setTextAlign: (a) => set({ textAlign: a }),
  setAllCaps: (v) => set({ allCaps: v }),

  fetchTemplates: async (t = en) => {
    cancelActiveTemplates();
    const controller = new AbortController();
    templatesController = controller;
    const runId = ++templatesRunId;
    const isCurrent = () => runId === templatesRunId && !controller.signal.aborted;

    set({ loading: true, error: null });
    try {
      const res = await fetch(appUrl("/api/v1/meme-templates"), {
        headers: formatHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          failedAnswerMessage(t, body, res.status, `Failed to load templates: ${res.status}`),
        );
      }
      const raw = await res.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isCurrent()) return;
      if (!isTemplateManifest(raw)) {
        throw new Error(t.errors.invalidServerResponse);
      }
      set({ templates: raw.templates, loading: false });
    } catch (err) {
      if (!isCurrent() || (err instanceof DOMException && err.name === "AbortError")) return;
      set({
        templates: [],
        error: err instanceof Error ? err.message : "Failed to load templates",
        loading: false,
      });
    } finally {
      if (templatesController === controller) templatesController = null;
    }
  },

  generateMeme: async (t = en) => {
    track(ANALYTICS_EVENTS.TOOL_STARTED, {
      tool_id: "meme-generator",
      is_batch: false,
      file_count: 1,
    });
    cancelActiveGeneration();
    const controller = new AbortController();
    generateController = controller;
    const runId = ++generateRunId;
    const isCurrent = () => runId === generateRunId && !controller.signal.aborted;

    const state = get();
    set({ generating: true, error: null, resultUrl: null, downloadUrl: null });

    try {
      const apiSettings = {
        templateId: state.selectedTemplate?.id,
        textLayout: state.customLayout ?? "top-bottom",
        textBoxes: state.textBoxValues,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize > 0 ? state.fontSize : undefined,
        textColor: state.textColor,
        strokeColor: state.strokeColor,
        textAlign: state.textAlign,
        allCaps: state.allCaps,
      };

      let response: Response;

      if (state.customFile) {
        const formData = new FormData();
        formData.append("file", state.customFile);
        formData.append("settings", JSON.stringify(apiSettings));
        response = await fetch(appUrl("/api/v1/tools/image/meme-generator"), {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
          signal: controller.signal,
        });
      } else {
        response = await fetch(appUrl("/api/v1/tools/image/meme-generator"), {
          method: "POST",
          headers: formatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(apiSettings),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          failedAnswerMessage(t, body, response.status, `Generation failed: ${response.status}`),
        );
      }

      const raw = await response.json().catch((err: unknown) => {
        if (err instanceof SyntaxError) return null;
        throw err;
      });
      if (!isCurrent()) return;
      const result = resolveServerUrls(raw);
      if (!isMemeGenerateResponse(result)) {
        throw new Error(t.errors.invalidServerResponse);
      }

      set({
        resultUrl: result.downloadUrl,
        downloadUrl: result.downloadUrl,
        phase: "result",
        generating: false,
      });
    } catch (err) {
      if (!isCurrent() || (err instanceof DOMException && err.name === "AbortError")) return;
      set({
        error: err instanceof Error ? err.message : "Meme generation failed",
        generating: false,
      });
    } finally {
      if (generateController === controller) generateController = null;
      if (isCurrent()) set({ generating: false });
    }
  },

  backToGallery: () => {
    cancelActiveGeneration();
    const oldUrl = get().customImageUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    set({
      phase: "gallery",
      selectedTemplate: null,
      customFile: null,
      customImageUrl: null,
      customLayout: null,
      textBoxValues: [],
      resultUrl: null,
      downloadUrl: null,
      error: null,
      generating: false,
    });
  },

  backToEditor: () => set({ phase: "editor", resultUrl: null, downloadUrl: null }),

  reset: () => {
    cancelActiveTemplates();
    cancelActiveGeneration();
    const oldUrl = get().customImageUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    set({
      phase: "gallery",
      templates: [],
      loading: true,
      searchQuery: "",
      activeCategory: "all",
      selectedTemplate: null,
      customFile: null,
      customImageUrl: null,
      customLayout: null,
      textBoxValues: [],
      fontFamily: "anton",
      fontSize: 0,
      textColor: "#ffffff",
      strokeColor: "#000000",
      textAlign: "center",
      allCaps: true,
      generating: false,
      resultUrl: null,
      downloadUrl: null,
      error: null,
    });
  },
}));
