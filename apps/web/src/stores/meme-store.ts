import { create } from "zustand";
import { formatHeaders } from "@/lib/api";

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
      `@font-face { font-family: '${f.family}'; src: url('/api/v1/meme-templates/fonts/${f.file}') format('truetype'); font-display: swap; }`,
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
  fetchTemplates: () => Promise<void>;
  generateMeme: () => Promise<void>;
  backToGallery: () => void;
  backToEditor: () => void;
  reset: () => void;
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

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/v1/meme-templates", { headers: formatHeaders() });
      if (!res.ok) throw new Error(`Failed to load templates: ${res.status}`);
      const data: TemplateManifest = await res.json();
      set({ templates: data.templates, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load templates",
        loading: false,
      });
    }
  },

  generateMeme: async () => {
    const state = get();
    set({ generating: true, error: null });

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
        response = await fetch("/api/v1/tools/image/meme-generator", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
        });
      } else {
        response = await fetch("/api/v1/tools/image/meme-generator", {
          method: "POST",
          headers: formatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(apiSettings),
        });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error || `Generation failed: ${response.status}`,
        );
      }

      const result = (await response.json()) as {
        jobId: string;
        downloadUrl: string;
        originalSize: number;
        processedSize: number;
      };

      set({
        resultUrl: result.downloadUrl,
        downloadUrl: result.downloadUrl,
        phase: "result",
        generating: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Meme generation failed",
        generating: false,
      });
    }
  },

  backToGallery: () => {
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
