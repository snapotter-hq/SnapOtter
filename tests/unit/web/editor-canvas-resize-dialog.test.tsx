// @vitest-environment jsdom

/**
 * #2068: the Canvas Size dialog's Background color was stored and never painted. The
 * store now paints it, so the dialog must only ever hand over a color the canvas can
 * parse: the picker's #rrggbb, or the same typed into the text box. Anything else in
 * the text box leaves the committed color alone and snaps back on blur, like the
 * color panel's hex field. A refused resize is logged and reported, not just toasted.
 */

import "@testing-library/jest-dom/vitest";
import { isSafeMessageError } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

const toastError = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/web/node_modules/sonner", () => ({ toast: { error: toastError } }));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { MemoryRouter } from "react-router";
import { CanvasResizeDialog } from "@/components/editor/common/canvas-resize-dialog";
import { ContextMenu } from "@/components/editor/common/context-menu";
import { ExportDialog } from "@/components/editor/common/export-dialog";
import { ImageResizeDialog } from "@/components/editor/common/image-resize-dialog";
import { EditorMenuBar } from "@/components/editor/editor-menu-bar";
import { CropOptions } from "@/components/editor/options/crop-options";
import { I18nProvider } from "@/contexts/i18n-context";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { captureHandledError } from "@/lib/analytics";
import { useEditorStore } from "@/stores/editor-store";

const resizeCanvas = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const resizeImage = vi.fn<(...args: unknown[]) => Promise<boolean>>();

function renderDialog() {
  const onClose = vi.fn();
  const dialog = (open: boolean) => (
    <I18nProvider>
      <CanvasResizeDialog open={open} onClose={onClose} />
    </I18nProvider>
  );
  const { rerender } = render(dialog(true));
  const reopen = () => {
    rerender(dialog(false));
    rerender(dialog(true));
  };
  return { onClose, reopen };
}

const picker = () => screen.getByLabelText("Background:") as HTMLInputElement;
const hexField = () => screen.getByTestId("canvas-fill-hex") as HTMLInputElement;
const transparentCheckbox = () =>
  screen.getByRole("checkbox", { name: "Transparent" }) as HTMLInputElement;
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply" }));

beforeEach(() => {
  storage.clear();
  resizeCanvas.mockReset();
  resizeCanvas.mockResolvedValue(true);
  resizeImage.mockReset();
  resizeImage.mockResolvedValue(true);
  useEditorStore.setState({
    resizeCanvas,
    resizeImage,
    canvasSize: { width: 800, height: 600 },
    rebaking: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Canvas Size dialog background color (#2068)", () => {
  it("defaults to white and hands the picker's color to the store", async () => {
    const { onClose } = renderDialog();
    expect(picker().value).toBe("#ffffff");
    expect(hexField().value).toBe("#ffffff");

    fireEvent.change(picker(), { target: { value: "#112233" } });
    expect(hexField().value).toBe("#112233");

    apply();
    await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center", "#112233"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it.each(["#abcdef", "#ABCDEF", "abcdef", "ABCDEF"])(
    "commits %s typed into the text box as #abcdef and mirrors it in the picker",
    async (typed) => {
      renderDialog();
      fireEvent.change(hexField(), { target: { value: typed } });
      expect(hexField().value).toBe(typed);
      expect(picker().value).toBe("#abcdef");

      apply();
      await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center", "#abcdef"));
    },
  );

  it("keeps the last committed color when the text is not one, and snaps back on blur", async () => {
    renderDialog();
    fireEvent.change(picker(), { target: { value: "#112233" } });
    fireEvent.change(hexField(), { target: { value: "red" } });
    expect(hexField().value).toBe("red");
    expect(picker().value).toBe("#112233");

    // A real click blurs the field first; fireEvent.click does not, so this also pins
    // that un-blurred bad text never reaches the store.
    apply();
    await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center", "#112233"));

    fireEvent.blur(hexField());
    expect(hexField().value).toBe("#112233");
  });

  it("drops an unfinished draft when the dialog is reopened", () => {
    const { reopen } = renderDialog();
    fireEvent.change(picker(), { target: { value: "#112233" } });
    fireEvent.change(hexField(), { target: { value: "re" } });
    expect(hexField().value).toBe("re");

    reopen();
    expect(hexField().value).toBe("#112233");
    expect(picker().value).toBe("#112233");
  });

  it("says so, reports the cause and stays open when the store refuses the resize", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Canvas background must be a #rrggbb color");
    resizeCanvas.mockRejectedValue(cause);
    const { onClose } = renderDialog();
    apply();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Something went wrong"));

    expect(log).toHaveBeenCalledWith("Canvas resize failed", cause);
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [reported] = vi.mocked(captureHandledError).mock.calls[0];
    expect(isSafeMessageError(reported)).toBe(true);
    expect(reported.cause).toBe(cause);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("stays open without an error toast when a resize is dropped (#2116)", async () => {
    resizeCanvas.mockResolvedValue(false);
    const { onClose } = renderDialog();
    apply();
    await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center", "#ffffff"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());

    expect(onClose).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("Image Size dialog closes when applied and stays open when a queued resize is dropped (#2116)", async () => {
    const onClose = vi.fn();
    resizeImage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(
      <I18nProvider>
        <ImageResizeDialog open={true} onClose={onClose} />
      </I18nProvider>,
    );

    apply();
    await waitFor(() => expect(resizeImage).toHaveBeenCalledWith(800, 600));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    apply();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("disables Apply in CanvasResizeDialog, ImageResizeDialog, CropOptions and ExportDialog while rebaking (#2115)", () => {
    useEditorStore.setState({
      rebaking: true,
      cropState: { x: 10, y: 10, width: 100, height: 100, aspectRatio: null },
    });
    const onClose = vi.fn();
    const { unmount } = render(
      <I18nProvider>
        <CanvasResizeDialog open={true} onClose={onClose} />
        <CropOptions />
      </I18nProvider>,
    );
    const applyButtons = screen.getAllByRole("button", { name: /apply/i });
    expect(applyButtons).toHaveLength(2);
    for (const btn of applyButtons) {
      expect(btn).toBeDisabled();
    }
    unmount();

    const { unmount: unmountImg } = render(
      <I18nProvider>
        <ImageResizeDialog open={true} onClose={onClose} />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    unmountImg();

    render(
      <I18nProvider>
        <ExportDialog onClose={onClose} />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save project/i })).toBeDisabled();
  });

  it("disables rebake, save and export menu items while rebaking, keeping New, Open and Close enabled (#2115)", () => {
    useEditorStore.setState({ sourceImageUrl: "blob:test" });
    useEditorStore.setState({ rebaking: true });
    const noop = vi.fn();
    render(
      <MemoryRouter>
        <I18nProvider>
          <EditorMenuBar
            onNewDocument={noop}
            onOpenImage={noop}
            onExport={noop}
            onSave={noop}
            onCanvasResize={noop}
            onImageResize={noop}
          />
          <ContextMenu
            position={{ x: 20, y: 20 }}
            menuType="canvas"
            onClose={noop}
            onCanvasResize={noop}
            onImageResize={noop}
          />
        </I18nProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("menu-file"));
    expect(screen.getByTestId("menu-item-new")).toBeEnabled();
    expect(screen.getByTestId("menu-item-open")).toBeEnabled();
    expect(screen.getByTestId("menu-item-close")).toBeEnabled();
    expect(screen.getByTestId("menu-item-save")).toBeDisabled();
    expect(screen.getByTestId("menu-item-export-as")).toBeDisabled();
    expect(screen.getByTestId("menu-item-quick-export-as-png")).toBeDisabled();

    fireEvent.click(screen.getByTestId("menu-edit"));
    expect(screen.getByTestId("menu-item-copy-merged")).toBeDisabled();
    fireEvent.mouseEnter(screen.getByTestId("menu-item-transform"));
    expect(screen.getByTestId("menu-item-flip-horizontal")).toBeDisabled();
    expect(screen.getByTestId("menu-item-flip-vertical")).toBeDisabled();

    fireEvent.click(screen.getByTestId("menu-image"));
    expect(screen.getByTestId("menu-item-image-size")).toBeDisabled();
    expect(screen.getByTestId("menu-item-canvas-size")).toBeDisabled();
    expect(screen.getByTestId("menu-item-trim")).toBeDisabled();
    fireEvent.mouseEnter(screen.getByTestId("menu-item-image-rotation"));
    expect(screen.getByTestId("menu-item-90-cw")).toBeDisabled();
    expect(screen.getByTestId("menu-item-90-ccw")).toBeDisabled();
    expect(screen.getByTestId("menu-item-180")).toBeDisabled();
    expect(screen.getByTestId("menu-item-flip-horizontal")).toBeDisabled();
    expect(screen.getByTestId("menu-item-flip-vertical")).toBeDisabled();

    // Context menu Canvas Size and Image Size buttons are also disabled.
    const canvasSizeBtns = screen.getAllByRole("button", { name: /canvas size/i });
    const imageSizeBtns = screen.getAllByRole("button", { name: /image size/i });
    for (const btn of [...canvasSizeBtns, ...imageSizeBtns]) {
      expect(btn).toBeDisabled();
    }
  });

  it("ignores Save, Export and Enter-to-crop shortcuts while rebaking (#2115)", () => {
    const onSave = vi.fn();
    const onExport = vi.fn();
    const applyCrop = vi.fn(async () => true);
    useEditorStore.setState({
      rebaking: true,
      isCropping: true,
      cropState: { x: 10, y: 10, width: 100, height: 100, aspectRatio: null },
      applyCrop,
    });
    function ShortcutHost() {
      useEditorShortcuts({ onSave, onExport });
      return null;
    }
    render(
      <I18nProvider>
        <ShortcutHost />
      </I18nProvider>,
    );

    fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(document.body, { key: "s", code: "KeyS", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "s", code: "KeyS", metaKey: true });
    fireEvent.keyDown(document, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: "S", code: "KeyS", metaKey: true, shiftKey: true });

    expect(applyCrop).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe("Canvas Size dialog transparent background (#2274)", () => {
  it("defaults to unchecked and leaves color inputs enabled", () => {
    renderDialog();
    expect(transparentCheckbox().checked).toBe(false);
    expect(picker()).toBeEnabled();
    expect(hexField()).toBeEnabled();
  });

  it("disables color inputs and calls resizeCanvas with three arguments when checked", async () => {
    const { onClose } = renderDialog();
    fireEvent.change(picker(), { target: { value: "#112233" } });
    fireEvent.click(transparentCheckbox());
    expect(transparentCheckbox().checked).toBe(true);
    expect(picker()).toBeDisabled();
    expect(hexField()).toBeDisabled();

    apply();
    await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center"));
    expect(resizeCanvas.mock.calls[0]).toHaveLength(3);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("re-enables color inputs and passes the fill when unchecked", async () => {
    renderDialog();
    fireEvent.change(picker(), { target: { value: "#112233" } });
    fireEvent.click(transparentCheckbox());
    expect(picker()).toBeDisabled();
    expect(hexField()).toBeDisabled();

    fireEvent.click(transparentCheckbox());
    expect(transparentCheckbox().checked).toBe(false);
    expect(picker()).toBeEnabled();
    expect(hexField()).toBeEnabled();

    apply();
    await waitFor(() => expect(resizeCanvas).toHaveBeenCalledWith(800, 600, "center", "#112233"));
    expect(resizeCanvas.mock.calls[0]).toHaveLength(4);
  });
});
