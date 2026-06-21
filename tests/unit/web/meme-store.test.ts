// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn(() => "blob:fake-url");
vi.stubGlobal("URL", { ...globalThis.URL, createObjectURL, revokeObjectURL });

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/api", () => ({ formatHeaders: vi.fn(() => ({})) }));

import type { MemeTemplate } from "@/stores/meme-store";
import {
  CATEGORIES,
  FONT_FAMILY_MAP,
  FONT_OPTIONS,
  PRESET_LAYOUTS,
  useMemeStore,
} from "@/stores/meme-store";

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function failResponse(status: number, body?: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => (body !== undefined ? Promise.resolve(body) : Promise.reject(new Error("no body"))),
  } as unknown as Response);
}

const TEMPLATE: MemeTemplate = {
  id: "drake",
  name: "Drake Hotline Bling",
  aliases: ["drake"],
  tags: ["reaction"],
  category: "reaction",
  filename: "drake.jpg",
  width: 600,
  height: 600,
  popularity: 100,
  textBoxes: [
    { id: "top", x: 50, y: 0, width: 50, height: 50, defaultText: "Nah" },
    { id: "bottom", x: 50, y: 50, width: 50, height: 50, defaultText: "Yeah" },
  ],
};

function resetStore() {
  useMemeStore.getState().reset();
  vi.clearAllMocks();
}

describe("useMemeStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const s = useMemeStore.getState();
      expect(s.phase).toBe("gallery");
      expect(s.templates).toEqual([]);
      expect(s.loading).toBe(true);
      expect(s.searchQuery).toBe("");
      expect(s.activeCategory).toBe("all");
      expect(s.selectedTemplate).toBeNull();
      expect(s.customFile).toBeNull();
      expect(s.customImageUrl).toBeNull();
      expect(s.customLayout).toBeNull();
      expect(s.textBoxValues).toEqual([]);
      expect(s.fontFamily).toBe("anton");
      expect(s.fontSize).toBe(0);
      expect(s.textColor).toBe("#ffffff");
      expect(s.strokeColor).toBe("#000000");
      expect(s.textAlign).toBe("center");
      expect(s.allCaps).toBe(true);
      expect(s.generating).toBe(false);
      expect(s.resultUrl).toBeNull();
      expect(s.downloadUrl).toBeNull();
      expect(s.error).toBeNull();
    });
  });

  describe("simple setters", () => {
    it("setPhase updates phase", () => {
      useMemeStore.getState().setPhase("editor");
      expect(useMemeStore.getState().phase).toBe("editor");
    });

    it("setSearchQuery updates searchQuery", () => {
      useMemeStore.getState().setSearchQuery("drake");
      expect(useMemeStore.getState().searchQuery).toBe("drake");
    });

    it("setActiveCategory updates activeCategory", () => {
      useMemeStore.getState().setActiveCategory("reaction");
      expect(useMemeStore.getState().activeCategory).toBe("reaction");
    });

    it("setFontFamily updates fontFamily", () => {
      useMemeStore.getState().setFontFamily("comic-sans");
      expect(useMemeStore.getState().fontFamily).toBe("comic-sans");
    });

    it("setFontSize updates fontSize", () => {
      useMemeStore.getState().setFontSize(32);
      expect(useMemeStore.getState().fontSize).toBe(32);
    });

    it("setTextColor updates textColor", () => {
      useMemeStore.getState().setTextColor("#ff0000");
      expect(useMemeStore.getState().textColor).toBe("#ff0000");
    });

    it("setStrokeColor updates strokeColor", () => {
      useMemeStore.getState().setStrokeColor("#00ff00");
      expect(useMemeStore.getState().strokeColor).toBe("#00ff00");
    });

    it("setTextAlign updates textAlign", () => {
      useMemeStore.getState().setTextAlign("left");
      expect(useMemeStore.getState().textAlign).toBe("left");
    });

    it("setAllCaps updates allCaps", () => {
      useMemeStore.getState().setAllCaps(false);
      expect(useMemeStore.getState().allCaps).toBe(false);
    });
  });

  describe("selectTemplate", () => {
    it("sets phase to editor", () => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
      expect(useMemeStore.getState().phase).toBe("editor");
    });

    it("sets selectedTemplate", () => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
      expect(useMemeStore.getState().selectedTemplate).toBe(TEMPLATE);
    });

    it("creates textBoxValues from template textBoxes", () => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
      const values = useMemeStore.getState().textBoxValues;
      expect(values).toHaveLength(2);
      expect(values[0]).toEqual({ id: "top", text: "" });
      expect(values[1]).toEqual({ id: "bottom", text: "" });
    });

    it("clears customFile, customImageUrl, and customLayout", () => {
      useMemeStore.setState({
        customFile: new File(["x"], "test.png"),
        customImageUrl: "blob:old",
        customLayout: "top-bottom",
      });
      useMemeStore.getState().selectTemplate(TEMPLATE);
      const s = useMemeStore.getState();
      expect(s.customFile).toBeNull();
      expect(s.customImageUrl).toBeNull();
      expect(s.customLayout).toBeNull();
    });

    it("clears resultUrl, downloadUrl, error, and generating", () => {
      useMemeStore.setState({
        resultUrl: "http://old",
        downloadUrl: "http://old",
        error: "old error",
        generating: true,
      });
      useMemeStore.getState().selectTemplate(TEMPLATE);
      const s = useMemeStore.getState();
      expect(s.resultUrl).toBeNull();
      expect(s.downloadUrl).toBeNull();
      expect(s.error).toBeNull();
      expect(s.generating).toBe(false);
    });

    it("revokes old customImageUrl if present", () => {
      useMemeStore.setState({ customImageUrl: "blob:to-revoke" });
      useMemeStore.getState().selectTemplate(TEMPLATE);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:to-revoke");
    });

    it("does not call revokeObjectURL when customImageUrl is null", () => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe("setCustomImage", () => {
    const file = new File(["pixels"], "photo.png", { type: "image/png" });

    it("sets phase to layout-picker", () => {
      useMemeStore.getState().setCustomImage(file);
      expect(useMemeStore.getState().phase).toBe("layout-picker");
    });

    it("creates blob URL via URL.createObjectURL", () => {
      useMemeStore.getState().setCustomImage(file);
      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(useMemeStore.getState().customImageUrl).toBe("blob:fake-url");
    });

    it("stores the file as customFile", () => {
      useMemeStore.getState().setCustomImage(file);
      expect(useMemeStore.getState().customFile).toBe(file);
    });

    it("clears selectedTemplate", () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      useMemeStore.getState().setCustomImage(file);
      expect(useMemeStore.getState().selectedTemplate).toBeNull();
    });

    it("revokes old customImageUrl", () => {
      useMemeStore.setState({ customImageUrl: "blob:old-custom" });
      useMemeStore.getState().setCustomImage(file);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-custom");
    });
  });

  describe("setCustomLayout", () => {
    it("sets phase to editor", () => {
      useMemeStore.getState().setCustomLayout("top-bottom");
      expect(useMemeStore.getState().phase).toBe("editor");
    });

    it("creates textBoxValues from PRESET_LAYOUTS", () => {
      useMemeStore.getState().setCustomLayout("center");
      const values = useMemeStore.getState().textBoxValues;
      expect(values).toHaveLength(1);
      expect(values[0]).toEqual({ id: "center", text: "" });
    });

    it("sets customLayout value", () => {
      useMemeStore.getState().setCustomLayout("side-by-side");
      expect(useMemeStore.getState().customLayout).toBe("side-by-side");
    });

    it("creates two text boxes for top-bottom layout", () => {
      useMemeStore.getState().setCustomLayout("top-bottom");
      const values = useMemeStore.getState().textBoxValues;
      expect(values).toHaveLength(2);
      expect(values[0].id).toBe("top");
      expect(values[1].id).toBe("bottom");
    });

    it("falls back to top-bottom layout for unknown layout", () => {
      useMemeStore.getState().setCustomLayout("nonexistent" as "top-bottom");
      const values = useMemeStore.getState().textBoxValues;
      expect(values).toHaveLength(2);
      expect(values[0].id).toBe("top");
      expect(values[1].id).toBe("bottom");
    });
  });

  describe("updateTextValue", () => {
    beforeEach(() => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
    });

    it("updates the correct text box by id", () => {
      useMemeStore.getState().updateTextValue("top", "Hello");
      const values = useMemeStore.getState().textBoxValues;
      expect(values.find((v) => v.id === "top")?.text).toBe("Hello");
    });

    it("leaves other text boxes unchanged", () => {
      useMemeStore.getState().updateTextValue("top", "Changed");
      const values = useMemeStore.getState().textBoxValues;
      expect(values.find((v) => v.id === "bottom")?.text).toBe("");
    });

    it("handles non-existent id gracefully", () => {
      useMemeStore.getState().updateTextValue("missing", "Nope");
      const values = useMemeStore.getState().textBoxValues;
      expect(values).toHaveLength(2);
      expect(values.every((v) => v.text === "" || v.id === "missing")).toBe(true);
    });
  });

  describe("fetchTemplates", () => {
    it("sets loading true and error null on start", async () => {
      useMemeStore.setState({ loading: false, error: "old" });
      fetchMock.mockReturnValue(new Promise(() => {}));
      const _promise = useMemeStore.getState().fetchTemplates();
      expect(useMemeStore.getState().loading).toBe(true);
      expect(useMemeStore.getState().error).toBeNull();
      fetchMock.mockReset();
      await Promise.resolve();
    });

    it("on success: sets templates from manifest and loading false", async () => {
      const manifest = { version: 1, categories: ["reaction"], templates: [TEMPLATE] };
      fetchMock.mockReturnValue(okJson(manifest));
      await useMemeStore.getState().fetchTemplates();
      const s = useMemeStore.getState();
      expect(s.templates).toEqual([TEMPLATE]);
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
    });

    it("on fetch failure: sets error message and loading false", async () => {
      fetchMock.mockRejectedValue(new Error("Network down"));
      await useMemeStore.getState().fetchTemplates();
      const s = useMemeStore.getState();
      expect(s.error).toBe("Network down");
      expect(s.loading).toBe(false);
    });

    it("on non-ok response: sets error with status code", async () => {
      fetchMock.mockReturnValue(failResponse(500));
      await useMemeStore.getState().fetchTemplates();
      const s = useMemeStore.getState();
      expect(s.error).toBe("Failed to load templates: 500");
      expect(s.loading).toBe(false);
    });
  });

  describe("generateMeme", () => {
    it("sets generating true on start", async () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      fetchMock.mockReturnValue(new Promise(() => {}));
      const _promise = useMemeStore.getState().generateMeme();
      expect(useMemeStore.getState().generating).toBe(true);
      expect(useMemeStore.getState().error).toBeNull();
      fetchMock.mockReset();
      await Promise.resolve();
    });

    it("with template: sends JSON POST (no FormData)", async () => {
      useMemeStore.setState({
        selectedTemplate: TEMPLATE,
        textBoxValues: [
          { id: "top", text: "Hello" },
          { id: "bottom", text: "World" },
        ],
      });
      const result = { jobId: "j1", downloadUrl: "/dl/j1", originalSize: 100, processedSize: 200 };
      fetchMock.mockReturnValue(okJson(result));
      await useMemeStore.getState().generateMeme();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/tools/image/meme-generator",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      );
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(callBody.templateId).toBe("drake");
    });

    it("with custom file: sends FormData POST", async () => {
      const file = new File(["x"], "img.png", { type: "image/png" });
      useMemeStore.setState({
        customFile: file,
        customLayout: "top-bottom",
        textBoxValues: [{ id: "top", text: "Hi" }],
      });
      const result = { jobId: "j2", downloadUrl: "/dl/j2", originalSize: 50, processedSize: 100 };
      fetchMock.mockReturnValue(okJson(result));
      await useMemeStore.getState().generateMeme();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/tools/image/meme-generator",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        }),
      );
    });

    it("on success: sets resultUrl, downloadUrl, phase result, generating false", async () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      const result = { jobId: "j1", downloadUrl: "/dl/j1", originalSize: 100, processedSize: 200 };
      fetchMock.mockReturnValue(okJson(result));
      await useMemeStore.getState().generateMeme();
      const s = useMemeStore.getState();
      expect(s.resultUrl).toBe("/dl/j1");
      expect(s.downloadUrl).toBe("/dl/j1");
      expect(s.phase).toBe("result");
      expect(s.generating).toBe(false);
    });

    it("on failure: sets error and generating false", async () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      fetchMock.mockRejectedValue(new Error("Boom"));
      await useMemeStore.getState().generateMeme();
      const s = useMemeStore.getState();
      expect(s.error).toBe("Boom");
      expect(s.generating).toBe(false);
    });

    it("on non-ok response: extracts error from body", async () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      fetchMock.mockReturnValue(failResponse(422, { error: "Invalid text" }));
      await useMemeStore.getState().generateMeme();
      expect(useMemeStore.getState().error).toBe("Invalid text");
    });

    it("on non-ok response with no body error: uses status code", async () => {
      useMemeStore.setState({ selectedTemplate: TEMPLATE });
      fetchMock.mockReturnValue(failResponse(500, {}));
      await useMemeStore.getState().generateMeme();
      expect(useMemeStore.getState().error).toBe("Generation failed: 500");
    });
  });

  describe("backToGallery", () => {
    it("resets phase to gallery", () => {
      useMemeStore.setState({ phase: "editor" });
      useMemeStore.getState().backToGallery();
      expect(useMemeStore.getState().phase).toBe("gallery");
    });

    it("clears all selection state", () => {
      useMemeStore.setState({
        selectedTemplate: TEMPLATE,
        customFile: new File(["x"], "x.png"),
        customLayout: "top-bottom",
        textBoxValues: [{ id: "top", text: "hi" }],
        resultUrl: "http://r",
        downloadUrl: "http://d",
        error: "err",
        generating: true,
      });
      useMemeStore.getState().backToGallery();
      const s = useMemeStore.getState();
      expect(s.selectedTemplate).toBeNull();
      expect(s.customFile).toBeNull();
      expect(s.customImageUrl).toBeNull();
      expect(s.customLayout).toBeNull();
      expect(s.textBoxValues).toEqual([]);
      expect(s.resultUrl).toBeNull();
      expect(s.downloadUrl).toBeNull();
      expect(s.error).toBeNull();
      expect(s.generating).toBe(false);
    });

    it("revokes customImageUrl", () => {
      useMemeStore.setState({ customImageUrl: "blob:revoke-me" });
      useMemeStore.getState().backToGallery();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:revoke-me");
    });
  });

  describe("backToEditor", () => {
    it("sets phase to editor", () => {
      useMemeStore.setState({ phase: "result" });
      useMemeStore.getState().backToEditor();
      expect(useMemeStore.getState().phase).toBe("editor");
    });

    it("clears resultUrl and downloadUrl", () => {
      useMemeStore.setState({ resultUrl: "http://r", downloadUrl: "http://d" });
      useMemeStore.getState().backToEditor();
      expect(useMemeStore.getState().resultUrl).toBeNull();
      expect(useMemeStore.getState().downloadUrl).toBeNull();
    });

    it("preserves other state", () => {
      useMemeStore.setState({
        phase: "result",
        selectedTemplate: TEMPLATE,
        fontFamily: "comic-sans",
        textColor: "#ff0000",
        textBoxValues: [{ id: "top", text: "kept" }],
      });
      useMemeStore.getState().backToEditor();
      const s = useMemeStore.getState();
      expect(s.selectedTemplate).toBe(TEMPLATE);
      expect(s.fontFamily).toBe("comic-sans");
      expect(s.textColor).toBe("#ff0000");
      expect(s.textBoxValues[0].text).toBe("kept");
    });
  });

  describe("reset", () => {
    it("resets everything to initial defaults", () => {
      useMemeStore.setState({
        phase: "result",
        templates: [TEMPLATE],
        loading: false,
        searchQuery: "drake",
        activeCategory: "reaction",
        selectedTemplate: TEMPLATE,
        customFile: new File(["x"], "x.png"),
        customLayout: "center",
        textBoxValues: [{ id: "top", text: "hi" }],
        fontFamily: "comic-sans",
        fontSize: 24,
        textColor: "#ff0000",
        strokeColor: "#00ff00",
        textAlign: "left",
        allCaps: false,
        generating: true,
        resultUrl: "http://r",
        downloadUrl: "http://d",
        error: "err",
      });
      useMemeStore.getState().reset();
      const s = useMemeStore.getState();
      expect(s.phase).toBe("gallery");
      expect(s.templates).toEqual([]);
      expect(s.loading).toBe(true);
      expect(s.searchQuery).toBe("");
      expect(s.activeCategory).toBe("all");
      expect(s.selectedTemplate).toBeNull();
      expect(s.customFile).toBeNull();
      expect(s.customImageUrl).toBeNull();
      expect(s.customLayout).toBeNull();
      expect(s.textBoxValues).toEqual([]);
      expect(s.fontFamily).toBe("anton");
      expect(s.fontSize).toBe(0);
      expect(s.textColor).toBe("#ffffff");
      expect(s.strokeColor).toBe("#000000");
      expect(s.textAlign).toBe("center");
      expect(s.allCaps).toBe(true);
      expect(s.generating).toBe(false);
      expect(s.resultUrl).toBeNull();
      expect(s.downloadUrl).toBeNull();
      expect(s.error).toBeNull();
    });

    it("revokes customImageUrl", () => {
      useMemeStore.setState({ customImageUrl: "blob:reset-me" });
      useMemeStore.getState().reset();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:reset-me");
    });
  });

  describe("constants", () => {
    it("FONT_OPTIONS has expected entries", () => {
      expect(FONT_OPTIONS.length).toBe(7);
      const values = FONT_OPTIONS.map((f) => f.value);
      expect(values).toContain("anton");
      expect(values).toContain("comic-sans");
      expect(values).toContain("bebas-neue");
      expect(values).toContain("permanent-marker");
    });

    it("FONT_FAMILY_MAP maps all font options", () => {
      for (const opt of FONT_OPTIONS) {
        expect(FONT_FAMILY_MAP[opt.value]).toBeDefined();
        expect(typeof FONT_FAMILY_MAP[opt.value]).toBe("string");
      }
    });

    it("CATEGORIES has expected entries", () => {
      expect(CATEGORIES.length).toBe(6);
      const ids = CATEGORIES.map((c) => c.id);
      expect(ids).toContain("all");
      expect(ids).toContain("reaction");
      expect(ids).toContain("comparison");
      expect(ids).toContain("animals");
      expect(ids).toContain("classic");
    });

    it("PRESET_LAYOUTS has all 5 layouts", () => {
      const keys = Object.keys(PRESET_LAYOUTS);
      expect(keys).toHaveLength(5);
      expect(keys).toContain("top-bottom");
      expect(keys).toContain("top-only");
      expect(keys).toContain("bottom-only");
      expect(keys).toContain("center");
      expect(keys).toContain("side-by-side");
    });

    it("PRESET_LAYOUTS have correct box structures", () => {
      expect(PRESET_LAYOUTS["top-bottom"].boxes).toHaveLength(2);
      expect(PRESET_LAYOUTS["top-only"].boxes).toHaveLength(1);
      expect(PRESET_LAYOUTS["bottom-only"].boxes).toHaveLength(1);
      expect(PRESET_LAYOUTS.center.boxes).toHaveLength(1);
      expect(PRESET_LAYOUTS["side-by-side"].boxes).toHaveLength(2);

      for (const layout of Object.values(PRESET_LAYOUTS)) {
        for (const box of layout.boxes) {
          expect(box).toHaveProperty("id");
          expect(box).toHaveProperty("x");
          expect(box).toHaveProperty("y");
          expect(box).toHaveProperty("width");
          expect(box).toHaveProperty("height");
          expect(box).toHaveProperty("defaultText");
        }
      }
    });
  });

  describe("injectMemeFonts", () => {
    it("creates style element in document head and is idempotent", async () => {
      const existing = document.getElementById("meme-generator-fonts");
      if (existing) existing.remove();

      vi.resetModules();

      const mod = await import("@/stores/meme-store");
      const inject = mod.injectMemeFonts;

      inject();
      const el = document.getElementById("meme-generator-fonts");
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe("STYLE");
      expect(el?.textContent).toContain("@font-face");
      expect(el?.textContent).toContain("Anton");

      inject();
      const elements = document.querySelectorAll("#meme-generator-fonts");
      expect(elements).toHaveLength(1);

      el?.remove();
    });
  });
});
