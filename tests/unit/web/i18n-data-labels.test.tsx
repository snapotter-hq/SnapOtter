// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locale-sentinel coverage for the #922 sweep: labels that used to live as
 * English in module-scope arrays and render back through a property access.
 * Every assertion is against the German bundle, because the provider defaults
 * to en and an English assertion would pass with or without the wiring.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { NewDocumentDialog } from "@/components/editor/common/new-document-dialog";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { CropOptions } from "@/components/editor/options/crop-options";
import { EyedropperOptions } from "@/components/editor/options/eyedropper-options";
import { I18nProvider } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";

function renderDe(ui: React.ReactNode) {
  localStorage.setItem("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  useEditorStore.setState({ cropState: null });
  cleanup();
  vi.clearAllMocks();
});

describe("data-structure label sweep (#922)", () => {
  it("localizes the eyedropper sample sizes, current and listed", async () => {
    renderDe(<EyedropperOptions sampleSize={3} onSampleSizeChange={() => {}} />);

    const dropdown = await screen.findByTestId("sample-size-dropdown");
    expect(dropdown).toHaveTextContent(de.editor.options.eyedropper.sampleAverage3);
    fireEvent.click(dropdown);
    expect(screen.getByText(de.editor.options.eyedropper.samplePoint)).toBeInTheDocument();
    expect(screen.getByText(de.editor.options.eyedropper.sampleAverage5)).toBeInTheDocument();
    expect(screen.queryByText("3x3 Average")).not.toBeInTheDocument();
    expect(screen.queryByText("Point (1x1)")).not.toBeInTheDocument();
  });

  it("localizes toolbar tool names without the old map-variable shadowing", async () => {
    renderDe(<EditorToolbar />);

    expect(await screen.findByTestId("tool-move")).toHaveAccessibleName(de.editor.toolbar.move);
    expect(screen.getByTestId("tool-crop")).toHaveAccessibleName(de.editor.toolbar.crop);
    expect(screen.queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
  });

  it("localizes the Free crop ratio while its option value stays a stable id", async () => {
    renderDe(<CropOptions />);

    const free = await screen.findByRole("option", { name: de.editor.options.crop.free });
    expect(free).toHaveValue("free");
    expect(screen.getByRole("option", { name: "16:9" })).toHaveValue("16:9");
    expect(screen.queryByRole("option", { name: "Free" })).not.toBeInTheDocument();
  });

  it("applies a ratio by id and clears it again on Free (#922)", async () => {
    useEditorStore.setState({
      cropState: { x: 0, y: 0, width: 400, height: 400, aspectRatio: null },
    });
    renderDe(<CropOptions />);

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "16:9" } });
    const ratioed = useEditorStore.getState().cropState;
    expect(ratioed?.aspectRatio).toBe("16:9");
    expect(ratioed?.width).toBe(400);
    expect(ratioed?.height).toBeCloseTo(225);

    fireEvent.change(select, { target: { value: "free" } });
    expect(useEditorStore.getState().cropState?.aspectRatio).toBeNull();
  });

  it("keeps new-document presets working on ids, with Custom translated (#922)", async () => {
    renderDe(<NewDocumentDialog open onClose={() => {}} />);

    const preset = (await screen.findByLabelText(
      de.editor.ui.newDocument.preset,
    )) as HTMLSelectElement;
    const width = screen.getByLabelText(de.editor.ui.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(de.editor.ui.heightPx) as HTMLInputElement;
    expect(preset.value).toBe("hd");
    expect(width.value).toBe("1920");

    fireEvent.change(preset, { target: { value: "4k" } });
    expect(preset.value).toBe("4k");
    expect(width.value).toBe("3840");
    expect(height.value).toBe("2160");

    fireEvent.change(width, { target: { value: "1000" } });
    expect(preset.value).toBe("custom");
    expect(preset.selectedOptions[0]).toHaveTextContent(de.editor.ui.newDocument.presetCustom);
    expect(screen.queryByRole("option", { name: "Custom" })).not.toBeInTheDocument();
  });
});
