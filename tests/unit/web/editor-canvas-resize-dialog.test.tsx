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

import { CanvasResizeDialog } from "@/components/editor/common/canvas-resize-dialog";
import { I18nProvider } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { useEditorStore } from "@/stores/editor-store";

const resizeCanvas = vi.fn<(...args: unknown[]) => Promise<void>>();

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
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply" }));

beforeEach(() => {
  storage.clear();
  resizeCanvas.mockReset();
  resizeCanvas.mockResolvedValue(undefined);
  useEditorStore.setState({ resizeCanvas, canvasSize: { width: 800, height: 600 } });
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
});
