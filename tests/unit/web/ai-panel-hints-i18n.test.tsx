// @vitest-environment jsdom

/**
 * #2061: four hint icons in the Smart Crop and Content-Aware Resize panels
 * passed hard-coded English to HintIcon although each already had a key in
 * every locale. The hint text is also the trigger's accessible name, so
 * screen readers read English too. Asserted against the German bundle: the
 * provider defaults to English, so an English assertion would pass whether or
 * not the component reads i18n.
 */

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { ContentAwareResizeControls } from "@/components/tools/content-aware-resize-settings";
import { SmartCropControls } from "@/components/tools/smart-crop-settings";
import { I18nProvider } from "@/contexts/i18n-context";

const smartCropEn = en.toolSettings["smart-crop"];
const smartCropDe = de.toolSettings["smart-crop"];
const resizeEn = en.toolSettings["content-aware-resize"];
const resizeDe = de.toolSettings["content-aware-resize"];

function renderDe(ui: React.ReactNode) {
  storage.set("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

/**
 * The hint's trigger button is named by its text. The German bundle loads
 * asynchronously, so a positive check waits for it.
 */
const hint = (text: string) => screen.queryByRole("button", { name: text });
const findHint = (text: string) => screen.findByRole("button", { name: text });

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
});

describe("hint icons read the active locale (#2061)", () => {
  it("has German text that differs from the English literal, or the checks below prove nothing", () => {
    expect(smartCropDe.detectionStrategyHint).not.toBe(smartCropEn.detectionStrategyHint);
    expect(smartCropDe.paddingHint).not.toBe(smartCropEn.paddingHint);
    expect(smartCropDe.facePaddingHint).not.toBe(smartCropEn.facePaddingHint);
    expect(resizeDe.protectFacesHint).not.toBe(resizeEn.protectFacesHint);
  });

  it("translates the Smart Crop detection strategy and padding hints", async () => {
    renderDe(<SmartCropControls />);

    expect(await findHint(smartCropDe.detectionStrategyHint)).toBeInTheDocument();
    expect(await findHint(smartCropDe.paddingHint)).toBeInTheDocument();
    expect(hint(smartCropEn.detectionStrategyHint)).not.toBeInTheDocument();
    expect(hint(smartCropEn.paddingHint)).not.toBeInTheDocument();
  });

  it("translates the Smart Crop face padding hint", async () => {
    renderDe(<SmartCropControls />);
    fireEvent.click(await screen.findByRole("button", { name: smartCropDe.faceFocus }));

    expect(await findHint(smartCropDe.facePaddingHint)).toBeInTheDocument();
    expect(hint(smartCropEn.facePaddingHint)).not.toBeInTheDocument();
  });

  it("translates the Content-Aware Resize face protection hint", async () => {
    renderDe(<ContentAwareResizeControls />);

    expect(await findHint(resizeDe.protectFacesHint)).toBeInTheDocument();
    expect(hint(resizeEn.protectFacesHint)).not.toBeInTheDocument();
  });
});
