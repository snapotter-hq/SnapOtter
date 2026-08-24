// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en, PASSPORT_SPECS } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, stage: undefined, elapsed: 0 },
  }),
}));

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as i18n-hardcoded-strings.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { ColorSettings } from "@/components/tools/color-settings";
import { SharpeningSettings } from "@/components/tools/sharpening-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { COLLAGE_TEMPLATES, collageTemplateLabel } from "@/lib/collage-templates";
import { passportCountryName, passportDocLabel } from "@/lib/passport-i18n";
import { useFileStore } from "@/stores/file-store";

function renderDe(ui: React.ReactNode) {
  storage.set("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function seedFile() {
  const file = new File(["png"], "photo.png", { type: "image/png" });
  useFileStore.setState({
    files: [file],
    selectedIndex: 0,
    entries: [
      {
        id: "e1",
        file,
        blobUrl: "blob:photo",
        previewLoading: false,
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        originalSize: file.size,
        originalWidth: null,
        originalHeight: null,
        status: "pending",
        error: null,
        modality: "image",
        previewKind: "image",
      },
    ],
  });
}

beforeEach(() => {
  storage.clear();
  seedFile();
});

afterEach(() => {
  cleanup();
  useFileStore.setState({ files: [], entries: [], selectedIndex: 0 });
  vi.clearAllMocks();
});

describe("shared-data labels are translatable (#906 follow-up)", () => {
  it("has a country and a document key in en for every passport spec", () => {
    const block = en.toolSettings["passport-photo"] as unknown as Record<string, string>;
    for (const spec of PASSPORT_SPECS) {
      expect(block[`country${spec.code}`], `country${spec.code}`).toBe(spec.name);
      expect(block[`doc${spec.code}`], `doc${spec.code}`).toBe(spec.documents[0].label);
    }
  });

  it("has a label key in en for every collage template", () => {
    const block = en.toolSettings.collage as unknown as Record<string, string>;
    for (const tpl of COLLAGE_TEMPLATES) {
      expect(tpl.labelKey, `${tpl.id} labelKey`).toBeTruthy();
      expect(block[tpl.labelKey], `${tpl.id} -> ${tpl.labelKey}`).toBe(tpl.label);
    }
  });

  it("resolves passport names in the active locale with an English fallback", () => {
    const us = PASSPORT_SPECS.find((s) => s.code === "US");
    if (!us) throw new Error("US spec missing");
    const deBlock = de.toolSettings["passport-photo"] as unknown as Record<string, string>;
    expect(passportCountryName(de, us)).toBe(deBlock.countryUS);
    expect(passportCountryName(de, us)).not.toBe(us.name);
    expect(passportDocLabel(de, us)).toBe(deBlock.docUS);
    // unknown code falls back to the data's English name
    const fake = { ...us, code: "ZZ" };
    expect(passportCountryName(de, fake)).toBe(us.name);
  });

  it("resolves collage template labels in the active locale with an English fallback", () => {
    const sideBySide = COLLAGE_TEMPLATES.find((t) => t.label === "Side by side");
    if (!sideBySide) throw new Error("side-by-side template missing");
    const deBlock = de.toolSettings.collage as unknown as Record<string, string>;
    expect(collageTemplateLabel(de, sideBySide)).toBe(deBlock[sideBySide.labelKey]);
    expect(collageTemplateLabel(de, sideBySide)).not.toBe(sideBySide.label);
    const fake = { ...sideBySide, labelKey: "nonexistentKey" };
    expect(collageTemplateLabel(de, fake)).toBe(sideBySide.label);
  });
});

describe("slider ids stay locale-stable (#906 follow-up)", () => {
  it("keeps the color slider ids English under a German render", async () => {
    renderDe(<ColorSettings />);
    await screen.findByText(de.toolSettings.color.brightness);
    expect(document.getElementById("color-slider-brightness")).toBeTruthy();
  });

  it("keeps the sharpening slider ids English under a German render", async () => {
    renderDe(<SharpeningSettings />);
    // default method is adaptive, whose first slider is Texture Amount
    await screen.findAllByText(de.toolSettings.sharpening.textureAmount);
    expect(document.getElementById("sharpen-slider-texture-amount")).toBeTruthy();
  });
});
