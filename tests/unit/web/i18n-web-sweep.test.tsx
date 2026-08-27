// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locale-sentinel coverage for the #909 sweep. Asserting on English would pass
 * whether or not a component reads i18n (the provider defaults to en), so every
 * assertion here is against the German bundle and each case also asserts the old
 * English literal is gone.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { BrushOptions } from "@/components/editor/options/brush-options";
import { I18nProvider } from "@/contexts/i18n-context";
import { PrivacyPolicyPage } from "@/pages/privacy-policy-page";
import { useEditorStore } from "@/stores/editor-store";

function renderDe(ui: React.ReactNode) {
  localStorage.setItem("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("web-wide i18n sweep (#909)", () => {
  it("localizes the before/after size summary, placeholders included", async () => {
    renderDe(
      <BeforeAfterSlider
        beforeSrc="blob:before"
        afterSrc="blob:after"
        beforeSize={2000}
        afterSize={1000}
      />,
    );

    // "Verarbeitet", not "Processed": German for both the alt text and the
    // composed size sentence, so the assertion fails if either is hardcoded.
    const contains = (needle: string) => (_: string, el: Element | null) =>
      el?.textContent?.includes(needle) ?? false;
    const processedLabel = de.comparison.processedSize.split("{size}")[0].trim();
    const smallerTail = de.comparison.smallerBadge.split("{percent}")[1];

    expect(await screen.findByAltText(de.comparison.processed)).toBeInTheDocument();
    expect(screen.getAllByText(contains(processedLabel)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(contains(smallerTail)).length).toBeGreaterThan(0);
    expect(screen.queryByAltText("Processed")).not.toBeInTheDocument();
    // queryAllByText, not queryByText: a function matcher also matches every
    // ancestor, so a reintroduced literal would throw "found multiple" rather
    // than fail the assertion.
    expect(screen.queryAllByText(contains("smaller"))).toHaveLength(0);
    // The composed sentence must substitute, not render any raw placeholder.
    expect(screen.queryAllByText(contains("{size}"))).toHaveLength(0);
  });

  it("localizes the metadata grid empty state", async () => {
    renderDe(<MetadataGrid data={{}} />);

    expect(await screen.findByText(de.commonUi.metadataGrid.noData)).toBeInTheDocument();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("localizes an editor options bar", async () => {
    useEditorStore.setState({ activeTool: "brush" });
    renderDe(<BrushOptions />);

    expect(await screen.findByText(de.editor.options.shared.size)).toBeInTheDocument();
    expect(screen.getByText(de.editor.shapes.opacity)).toBeInTheDocument();
    expect(screen.getByText(de.editor.options.shared.hardness)).toBeInTheDocument();
    expect(screen.queryByText("Hardness")).not.toBeInTheDocument();
  });

  it("localizes the privacy policy prose and keeps the inline code tokens literal", async () => {
    renderDe(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(de.privacyPolicy.overview.heading)).toBeInTheDocument();
    expect(screen.getByText(de.privacyPolicy.overview.body)).toBeInTheDocument();
    expect(screen.getByText(de.privacyPolicy.yourControl.body)).toBeInTheDocument();
    expect(screen.queryByText(/self-hosted, open-source file processing/)).not.toBeInTheDocument();

    // Identifiers stay untranslated, and no placeholder of any name survives
    // into the DOM (a locale that renamed one would still be caught).
    expect(screen.getByText("SNAPOTTER_ANALYTICS=off")).toBeInTheDocument();
    expect(screen.getByText("feedback_submitted")).toBeInTheDocument();
    const anyPlaceholder = (_: string, el: Element | null) =>
      /\{[a-z]+\}/i.test(el?.textContent ?? "");
    expect(screen.queryAllByText(anyPlaceholder)).toHaveLength(0);
  });
});
