// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1944: Copy Merged (Ctrl/Cmd+Shift+C) said nothing when the copy failed,
 * which is every time on a plain-http install with no async Clipboard API,
 * and the Edit menu's Copy Merged row ran plain Copy (copyObjects) instead.
 * #1978: it exported the Stage through its zoom/pan transform, so it copied
 * the viewport instead of the document.
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

const copyImage = vi.hoisted(() =>
  vi.fn<(blob: Blob | Promise<Blob>, type?: string) => Promise<boolean>>(),
);
const realCopyImage = vi.hoisted(() => ({
  current: null as ((blob: Blob | Promise<Blob>, type?: string) => Promise<boolean>) | null,
}));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  realCopyImage.current = actual.copyImageToClipboard;
  return {
    ...actual,
    copyImageToClipboard: copyImage,
  };
});

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
const originalClipboard = navigator.clipboard;
const originalClipboardItem = globalThis.ClipboardItem;

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

type FakeCanvas = { toBlob: (cb: (blob: Blob | null) => void, type?: string) => void };

function fakeStage(toBlob: FakeCanvas["toBlob"] = (cb) => cb(PNG())) {
  const state = { width: 800, height: 600, scaleX: 2.5, scaleY: 2.5, x: 140, y: 90 };
  let capturedAt: typeof state | null = null;
  const canvas = { toBlob: vi.fn(toBlob) };
  const stage = {
    width: () => state.width,
    height: () => state.height,
    scaleX: () => state.scaleX,
    scaleY: () => state.scaleY,
    x: () => state.x,
    y: () => state.y,
    size: vi.fn(({ width, height }: { width: number; height: number }) => {
      state.width = width;
      state.height = height;
    }),
    scale: vi.fn(({ x, y }: { x: number; y: number }) => {
      state.scaleX = x;
      state.scaleY = y;
    }),
    position: vi.fn(({ x, y }: { x: number; y: number }) => {
      state.x = x;
      state.y = y;
    }),
    draw: vi.fn(),
    toCanvas: vi.fn(() => {
      capturedAt = { ...state };
      return canvas;
    }),
  };
  stageHolder.current = stage;
  return { stage, canvas, state, capturedAt: () => capturedAt };
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
  Object.assign(navigator, { clipboard: originalClipboard });
  if (originalClipboardItem === undefined) {
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  } else {
    globalThis.ClipboardItem = originalClipboardItem;
  }
  vi.restoreAllMocks();
});

describe("Copy Merged shortcut (#1944, #1979)", () => {
  it("says the copy failed when the clipboard refuses the image", async () => {
    fakeStage();
    copyImage.mockResolvedValue(false);
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).toHaveBeenCalledTimes(1);
    const passed = await copyImage.mock.calls[0][0];
    expect(passed).toBeInstanceOf(Blob);
    expect(passed.type).toBe("image/png");
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
  });

  it("calls copyImageToClipboard synchronously before canvas.toBlob resolves so WebKit keeps the user gesture (#1979)", async () => {
    let finishBlob!: (b: Blob | null) => void;
    fakeStage((cb) => {
      finishBlob = cb;
    });
    copyImage.mockImplementation(async (blob) => {
      const resolved = await blob;
      return resolved.size > 0;
    });
    renderShortcuts();

    pressCopyMerged();
    // Must be called synchronously inside the keydown handler, before toBlob finishes.
    expect(copyImage).toHaveBeenCalledTimes(1);
    expect(copyImage.mock.calls[0][0]).toBeInstanceOf(Promise);

    finishBlob(PNG());
    await settle();
    expect(screen.queryByText(COPY_FAILED)).not.toBeInTheDocument();
  });

  it("says the copy failed and logs why when the stage can't be exported", async () => {
    // A tainted canvas's toBlob throws SecurityError synchronously.
    const { state } = fakeStage(() => {
      throw new DOMException("The canvas has been tainted", "SecurityError");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(DOMException));
    expect(state).toEqual({
      width: 800,
      height: 600,
      scaleX: 2.5,
      scaleY: 2.5,
      x: 140,
      y: 90,
    });
  });

  it("restores the stage transform and shows the toast when stage.toCanvas throws", async () => {
    const { stage, state } = fakeStage();
    stage.toCanvas.mockImplementation(() => {
      throw new RangeError("Invalid array length");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(RangeError));
    expect(state).toEqual({
      width: 800,
      height: 600,
      scaleX: 2.5,
      scaleY: 2.5,
      x: 140,
      y: 90,
    });
  });

  it.each([
    ["null", null],
    ["zero-byte blob", new Blob([], { type: "image/png" })],
  ])("says the copy failed when the export comes back as %s", async (_label, empty) => {
    fakeStage((cb) => cb(empty));
    Object.assign(navigator, {
      clipboard: {
        write: vi
          .fn()
          .mockImplementation(async (items: Array<{ items: Record<string, unknown> }>) => {
            await items[0].items["image/png"];
          }),
      },
    });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    };
    copyImage.mockImplementation((blob, type) => {
      if (!realCopyImage.current) throw new Error("Expected realCopyImage");
      return realCopyImage.current(blob, type);
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShortcuts();

    pressCopyMerged();
    await settle();

    expect(copyImage).toHaveBeenCalledTimes(1);
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

describe("Edit > Copy Merged (#1944, #1978)", () => {
  it("copies the merged document without the stage's zoom and pan transform, not the selected objects", async () => {
    const { stage, canvas, state, capturedAt } = fakeStage();
    copyImage.mockResolvedValue(true);
    const copyObjects = vi.fn();
    useEditorStore.setState({ copyObjects, canvasSize: { width: 321, height: 123 } });
    renderMenuBar();

    clickCopyMerged();
    await settle();

    expect(copyObjects).not.toHaveBeenCalled();
    expect(stage.toCanvas).toHaveBeenCalledTimes(1);
    expect(stage.toCanvas).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 321,
      height: 123,
      pixelRatio: 1,
    });
    expect(capturedAt()).toEqual({
      width: 321,
      height: 123,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    });
    expect(state).toEqual({
      width: 800,
      height: 600,
      scaleX: 2.5,
      scaleY: 2.5,
      x: 140,
      y: 90,
    });
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
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
