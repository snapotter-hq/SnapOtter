// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastErrorSpy = vi.hoisted(() => vi.fn());
const toastInfoSpy = vi.hoisted(() => vi.fn());

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastErrorSpy, info: toastInfoSpy },
}));

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { CollagePreview } from "@/components/tools/collage-preview";
import { CollageSettings } from "@/components/tools/collage-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { beginCollageRun, useCollageStore } from "@/stores/collage-store";

const png = (name: string) => new File([new ArrayBuffer(64)], name, { type: "image/png" });
const txt = (name: string) => new File(["hello"], name, { type: "text/plain" });

/** Click the control, then answer the file picker it opened with `files`. */
function pickFiles(trigger: HTMLElement, files: File[]): HTMLInputElement {
  const inputs: HTMLInputElement[] = [];
  const spy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    inputs.push(this);
  });
  fireEvent.click(trigger);
  spy.mockRestore();
  const input = inputs[0];
  Object.defineProperty(input, "files", { value: files });
  act(() => {
    input.dispatchEvent(new Event("change"));
  });
  return input;
}

describe("CollagePreview rejects non-image files (#2863)", () => {
  beforeEach(() => {
    toastErrorSpy.mockClear();
    toastInfoSpy.mockClear();
    URL.createObjectURL ??= () => "";
    URL.revokeObjectURL ??= () => {};
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:c");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    useCollageStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderPreview = () =>
    render(
      <I18nProvider>
        <CollagePreview />
      </I18nProvider>,
    );

  const renderSettings = () =>
    render(
      <I18nProvider>
        <CollageSettings />
      </I18nProvider>,
    );

  it("shows the unsupported toast when only non-images are dropped on the upload area", () => {
    renderPreview();
    const zone = screen.getByRole("region", { name: en.a11y.fileDropZone });
    fireEvent.drop(zone, { dataTransfer: { files: [txt("notes.txt")] } });
    expect(useCollageStore.getState().images).toHaveLength(0);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
  });

  it("filters non-images picked through the upload area and shows the toast", () => {
    renderPreview();
    const input = pickFiles(screen.getByText(/upload images/i), [txt("notes.txt")]);
    for (const ext of [".jxl", ".dng", ".psd", ".tiff"]) {
      expect(input.accept).toContain(ext);
    }
    expect(useCollageStore.getState().images).toHaveLength(0);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
  });

  it("keeps the images and drops the text file from a mixed pick on the upload area", () => {
    renderPreview();
    pickFiles(screen.getByText(/upload images/i), [png("a.png"), txt("notes.txt")]);
    expect(useCollageStore.getState().images).toHaveLength(1);
    expect(useCollageStore.getState().images[0].file.name).toBe("a.png");
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });

  it("filters non-images picked through the strip + button and shows the toast", async () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png")]);
    });
    const { container } = renderPreview();
    const add = container.querySelector(
      'button[aria-label*="dd" i], button:has(svg.lucide-image-plus)',
    );
    expect(add).toBeTruthy();
    const input = pickFiles(add as HTMLElement, [txt("notes.txt")]);
    for (const ext of [".jxl", ".dng", ".psd", ".tiff"]) {
      expect(input.accept).toContain(ext);
    }
    expect(useCollageStore.getState().images).toHaveLength(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
  });

  it("does not show the toast when cancelling the picker or dropping an empty file list", () => {
    renderPreview();
    const zone = screen.getByRole("region", { name: en.a11y.fileDropZone });
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    pickFiles(screen.getByText(/upload images/i), []);
    expect(toastErrorSpy).not.toHaveBeenCalled();

    act(() => {
      useCollageStore.getState().addImages([png("a.png")]);
    });
    const add = document.querySelector(
      'button[aria-label*="dd" i], button:has(svg.lucide-image-plus)',
    );
    expect(add).toBeTruthy();
    pickFiles(add as HTMLElement, []);
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });

  it("labels the ImageStrip + button with t.toolPage.addMore (#3236)", () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png"), png("b.png")]);
    });
    renderPreview();
    const addButton = screen.getByRole("button", { name: en.toolPage.addMore });
    expect(addButton).toHaveAttribute("aria-label", en.toolPage.addMore);
  });

  it("refuses late ImageStrip file-picker onchange while a collage run is processing without aborting the active run (#3236)", () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png"), png("b.png")]);
    });
    const { container } = renderPreview();

    const inputs: HTMLInputElement[] = [];
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      inputs.push(this);
    });
    const addButton =
      screen.queryByRole("button", { name: en.toolPage.addMore }) ??
      (container.querySelector("button:has(svg.lucide-image-plus)") as HTMLElement);
    fireEvent.click(addButton);
    expect(inputs).toHaveLength(1);
    const pickerInput = inputs[0];

    const abortSpy = vi.fn();
    const run = beginCollageRun(abortSpy);
    useCollageStore.getState().setPhase("processing");

    // A click reaching ImageStrip.handleAddMore before the processing view commits is refused before opening a picker.
    fireEvent.click(addButton);
    clickSpy.mockRestore();
    expect(inputs).toHaveLength(1);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });
    toastInfoSpy.mockClear();

    act(() => {
      useCollageStore.getState().setPhase("processing");
    });

    // Empty picker cancellation while processing stays silent.
    Object.defineProperty(pickerInput, "files", { value: [], configurable: true });
    act(() => {
      pickerInput.dispatchEvent(new Event("change"));
    });
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();

    // Unsupported file selection while processing shows the unsupported toast without aborting the run.
    Object.defineProperty(pickerInput, "files", {
      value: [txt("notes.txt")],
      configurable: true,
    });
    act(() => {
      pickerInput.dispatchEvent(new Event("change"));
    });
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();

    // Valid image selection while processing is rejected with showIntakeIgnored and leaves the run intact.
    Object.defineProperty(pickerInput, "files", {
      value: [png("c.png")],
      configurable: true,
    });
    act(() => {
      pickerInput.dispatchEvent(new Event("change"));
    });
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });
    expect(abortSpy).not.toHaveBeenCalled();
    expect(run.isCurrent()).toBe(true);
    expect(useCollageStore.getState().phase).toBe("processing");
    expect(useCollageStore.getState().images.map((i) => i.file.name)).toEqual(["a.png", "b.png"]);

    // Once the run finishes, selecting the image adds it.
    run.end();
    act(() => {
      useCollageStore.getState().setPhase("editing");
    });
    act(() => {
      pickerInput.dispatchEvent(new Event("change"));
    });
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(useCollageStore.getState().images.map((i) => i.file.name)).toEqual([
      "a.png",
      "b.png",
      "c.png",
    ]);
  });

  it("refuses UploadArea click, drop, and late file-picker onchange while a collage run is processing (#3236)", () => {
    renderPreview();

    const inputs: HTMLInputElement[] = [];
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      inputs.push(this);
    });
    fireEvent.click(
      screen.getByRole("button", { name: en.toolSettings.collage.uploadImagesForCollage }),
    );
    expect(inputs).toHaveLength(1);
    const pickerInput = inputs[0];

    const abortSpy = vi.fn();
    const run = beginCollageRun(abortSpy);
    act(() => {
      useCollageStore.getState().setPhase("processing");
    });

    // Clicking upload while processing (when images.length === 0 keeps UploadArea mounted) is refused before opening a picker.
    fireEvent.click(
      screen.getByRole("button", { name: en.toolSettings.collage.uploadImagesForCollage }),
    );
    expect(inputs).toHaveLength(1);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });

    // Dropping an image on UploadArea while processing is refused without aborting the run.
    const zone = screen.getByRole("region", { name: en.a11y.fileDropZone });
    fireEvent.drop(zone, { dataTransfer: { files: [png("dropped.png")] } });
    expect(toastInfoSpy).toHaveBeenCalledTimes(2);
    expect(abortSpy).not.toHaveBeenCalled();
    expect(useCollageStore.getState().images).toHaveLength(0);

    // Late picker onchange opened while idle is refused once processing starts.
    Object.defineProperty(pickerInput, "files", {
      value: [png("picked.png")],
      configurable: true,
    });
    act(() => {
      pickerInput.dispatchEvent(new Event("change"));
    });
    expect(toastInfoSpy).toHaveBeenCalledTimes(3);
    expect(abortSpy).not.toHaveBeenCalled();
    expect(run.isCurrent()).toBe(true);
    expect(useCollageStore.getState().phase).toBe("processing");
    expect(useCollageStore.getState().images).toHaveLength(0);

    clickSpy.mockRestore();
    run.end();
  });

  it("labels ImageStrip thumbnail remove buttons with t.common.delete (#3275)", () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png"), png("b.png")]);
    });
    renderPreview();

    const deleteButtons = screen.getAllByRole("button", { name: en.common.delete });
    expect(deleteButtons).toHaveLength(2);
    for (const btn of deleteButtons) {
      expect(btn).toHaveAttribute("aria-label", en.common.delete);
    }
  });

  it("refuses ImageStrip thumbnail remove clicks while a collage run is processing without aborting the active run (#3275)", () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png"), png("b.png")]);
    });
    const { container } = renderPreview();

    const deleteButton =
      screen.queryAllByRole("button", { name: en.common.delete })[0] ??
      (container.querySelector("button:has(svg.lucide-x)") as HTMLElement);
    expect(deleteButton).toBeTruthy();

    const abortSpy = vi.fn();
    const run = beginCollageRun(abortSpy);
    // Simulate a click reaching the remove button right after processing starts before ProcessingView commits.
    useCollageStore.getState().setPhase("processing");
    vi.mocked(URL.revokeObjectURL).mockClear();

    fireEvent.click(deleteButton);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });
    expect(abortSpy).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(run.isCurrent()).toBe(true);
    expect(useCollageStore.getState().phase).toBe("processing");
    expect(useCollageStore.getState().images.map((i) => i.file.name)).toEqual(["a.png", "b.png"]);

    // Once the run finishes and returns to editing, clicking delete removes the image.
    run.end();
    act(() => {
      useCollageStore.getState().setPhase("editing");
    });
    const activeDeleteButton =
      screen.queryAllByRole("button", { name: en.common.delete })[0] ??
      (container.querySelector("button:has(svg.lucide-x)") as HTMLElement);
    fireEvent.click(activeDeleteButton);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(useCollageStore.getState().images.map((i) => i.file.name)).toEqual(["b.png"]);
  });

  it("refuses CollageSettings Clear all while a collage run is processing without aborting the active run (#3275)", () => {
    act(() => {
      useCollageStore.getState().addImages([png("a.png"), png("b.png")]);
    });
    renderSettings();

    const clearAllButton = screen.getByRole("button", { name: en.toolPage.clearAll });
    const abortSpy = vi.fn();
    const run = beginCollageRun(abortSpy);
    act(() => {
      useCollageStore.getState().setPhase("processing");
    });
    vi.mocked(URL.revokeObjectURL).mockClear();

    fireEvent.click(clearAllButton);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });
    expect(abortSpy).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(run.isCurrent()).toBe(true);
    expect(useCollageStore.getState().phase).toBe("processing");
    expect(useCollageStore.getState().images.map((i) => i.file.name)).toEqual(["a.png", "b.png"]);

    // Once the run finishes (phase === "result"), clicking Clear all clears the loaded images and resets to upload.
    run.end();
    act(() => {
      useCollageStore.getState().setResult("/api/v1/jobs/j1/download", 2048, 4096, "j1");
    });
    expect(useCollageStore.getState().phase).toBe("result");
    fireEvent.click(clearAllButton);
    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(useCollageStore.getState().images).toHaveLength(0);
    expect(useCollageStore.getState().phase).toBe("upload");
  });
});
