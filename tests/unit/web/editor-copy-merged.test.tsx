// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1944: Copy Merged (Ctrl/Cmd+Shift+C) said nothing when the copy failed,
 * which is every time on a plain-http install with no async Clipboard API,
 * and the Edit menu's Copy Merged row ran plain Copy (copyObjects) instead.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

const stageHolder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: stageHolder,
}));

const copyImage = vi.hoisted(() => vi.fn<(blob: Blob) => Promise<boolean>>());
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  copyImageToClipboard: copyImage,
}));

import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { EditorMenuBar } from "@/components/editor/editor-menu-bar";
import { I18nProvider } from "@/contexts/i18n-context";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { hotkeysModIsMeta } from "@/lib/platform";
import { useEditorStore } from "@/stores/editor-store";
// sonner only resolves under apps/web, so reach the copy the app imports; a
// bare-specifier import or vi.mock from here would get a different instance.
import { Toaster } from "../../../apps/web/node_modules/sonner";

const COPY_FAILED = en.editor.ui.exportDialog.copyFailed;
const INITIAL_STATE = useEditorStore.getState();

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

function fakeStage(toBlob: () => Promise<unknown> = async () => PNG()) {
  stageHolder.current = { toBlob: vi.fn(toBlob) };
  return stageHolder.current as { toBlob: ReturnType<typeof vi.fn> };
}

function pressCopyMerged() {
  const mod = hotkeysModIsMeta() ? { metaKey: true } : { ctrlKey: true };
  fireEvent.keyDown(document, { key: "C", code: "KeyC", shiftKey: true, ...mod });
}

function renderShortcuts() {
  render(<Toaster />);
  renderHook(() => useEditorShortcuts());
}

function renderMenuBar() {
  const noop = () => {};
  render(
    <MemoryRouter>
      <I18nProvider>
        <Toaster />
        <EditorMenuBar
          onNewDocument={noop}
          onOpenImage={noop}
          onExport={noop}
          onSave={noop}
          onCanvasResize={noop}
          onImageResize={noop}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

function clickCopyMerged() {
  fireEvent.click(screen.getByTestId("menu-edit"));
  fireEvent.click(screen.getByTestId("menu-item-copy-merged"));
}

/** Lets the export/clipboard promise chain settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "en");
  useEditorStore.setState(INITIAL_STATE, true);
  stageHolder.current = null;
  copyImage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Copy Merged shortcut (#1944)", () => {
  it("says the copy failed when the clipboard refuses the image", async () => {
    fakeStage();
    copyImage.mockResolvedValue(false);
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).toHaveBeenCalledTimes(1);
    expect(copyImage.mock.calls[0][0].type).toBe("image/png");
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
  });

  it("says the copy failed and logs why when the stage can't be exported", async () => {
    // Konva's toBlob rejects with the canvas's SecurityError; its toDataURL
    // would swallow it and return "".
    fakeStage(async () => {
      throw new DOMException("The canvas has been tainted", "SecurityError");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(DOMException));
  });

  it("says the copy failed when the export comes back empty", async () => {
    fakeStage(async () => null);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the copy works, and doesn't also run plain Copy", async () => {
    fakeStage();
    copyImage.mockResolvedValue(true);
    const copyObjects = vi.fn();
    useEditorStore.setState({ copyObjects });
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).toHaveBeenCalledTimes(1);
    expect(copyObjects).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY_FAILED)).not.toBeInTheDocument();
  });

  it("says it in the reader's language", async () => {
    storage.set("snapotter-locale", "de");
    fakeStage();
    copyImage.mockResolvedValue(false);
    render(<Toaster />);
    renderHook(() => useEditorShortcuts(), { wrapper: I18nProvider });
    // The German bundle loads asynchronously; let it land before pressing.
    await settle();

    pressCopyMerged();
    await settle();

    expect(de.editor.ui.exportDialog.copyFailed).not.toBe(COPY_FAILED);
    expect(await screen.findByText(de.editor.ui.exportDialog.copyFailed)).toBeInTheDocument();
  });

  it("does nothing with no canvas on screen", async () => {
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY_FAILED)).not.toBeInTheDocument();
  });
});

describe("Edit > Copy Merged (#1944)", () => {
  it("copies the merged image, not the selected objects", async () => {
    const stage = fakeStage();
    copyImage.mockResolvedValue(true);
    const copyObjects = vi.fn();
    useEditorStore.setState({ copyObjects, canvasSize: { width: 321, height: 123 } });
    renderMenuBar();

    clickCopyMerged();
    await settle();

    expect(copyObjects).not.toHaveBeenCalled();
    expect(stage.toBlob).toHaveBeenCalledTimes(1);
    expect(stage.toBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 321,
        height: 123,
        pixelRatio: 1,
        mimeType: "image/png",
      }),
    );
    expect(copyImage).toHaveBeenCalledTimes(1);
  });

  it("says the copy failed when the clipboard refuses the image", async () => {
    fakeStage();
    copyImage.mockResolvedValue(false);
    renderMenuBar();

    clickCopyMerged();
    await settle();

    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
  });
});
