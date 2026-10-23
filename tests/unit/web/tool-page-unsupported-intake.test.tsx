// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastErrorSpy = vi.hoisted(() => vi.fn());
const toastInfoSpy = vi.hoisted(() => vi.fn());

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: {
    error: toastErrorSpy,
    info: toastInfoSpy,
  },
}));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { I18nProvider } from "@/contexts/i18n-context";
import { ToolPage } from "@/pages/tool-page";
import { useFeaturesStore } from "@/stores/features-store";
import { type FileEntry, useFileStore } from "@/stores/file-store";
import { useSettingsStore } from "@/stores/settings-store";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

function renderToolPage(path = "/image/resize") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Link to="/pdf/merge-pdf" data-testid="switch-tool">
          Switch tool
        </Link>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function makePasteEvent({
  files = [] as File[],
  items = [] as Array<{ kind: string; type: string; getAsFile: () => File | null }>,
}) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files, items },
  });
  return event;
}

let blobCounter = 0;

beforeEach(() => {
  storageMap.clear();
  blobCounter = 0;
  toastErrorSpy.mockClear();
  toastInfoSpy.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("localStorage", localStorageMock);
  class MockURL extends URL {
    static createObjectURL = () => `blob:original-input-${++blobCounter}`;
    static revokeObjectURL = () => {};
  }
  vi.stubGlobal("URL", MockURL);
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ authEnabled: false }), { status: 200 })),
    ),
  );
  useFileStore.getState().reset();
  useSettingsStore.setState({ disabledTools: [], loaded: true, loadError: false });
  useFeaturesStore.setState({ bundles: [], loaded: false, loadError: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useFileStore.getState().reset();
  useSettingsStore.setState({ disabledTools: [], loaded: false, loadError: false });
  useFeaturesStore.setState({ bundles: [], loaded: false, loadError: false });
});

describe("ToolPage unsupported file paste and drop (#2305)", () => {
  it("shows the unsupported-type toast and clears the drop overlay when an unsupported file is dropped onto a loaded tool page", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const imageArea = screen.getByLabelText(en.a11y.imageArea);
    fireEvent.dragEnter(imageArea, {
      dataTransfer: { files: [txtFile], types: ["Files"] },
    });
    expect(screen.getByText(en.dropzone.dropToReplace)).toBeTruthy();

    fireEvent.drop(imageArea, {
      dataTransfer: { files: [txtFile], types: ["Files"] },
    });

    expect(screen.queryByText(en.dropzone.dropToReplace)).toBeNull();
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("shows the unsupported-type toast and does not call preventDefault when an unsupported file is pasted", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = makePasteEvent({
      files: [txtFile],
      items: [
        { kind: "file", type: "text/plain", getAsFile: () => txtFile },
        { kind: "string", type: "text/plain", getAsFile: () => null },
      ],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("shows the unsupported-type toast via clipboardData.items when clipboardData.files is empty", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = makePasteEvent({
      files: [],
      items: [{ kind: "file", type: "text/plain", getAsFile: () => txtFile }],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("accepts supported files in a mixed paste, prevents default, and does not show the unsupported toast", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const nextPng = new File(["next-bytes"], "next.png", { type: "image/png" });
    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = makePasteEvent({
      files: [nextPng, txtFile],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([nextPng]);
  });

  it("shows the unsupported-type toast when an unsupported file is pasted onto an empty tool page", async () => {
    await act(async () => {
      renderToolPage("/image/resize");
    });

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = makePasteEvent({
      files: [txtFile],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(useFileStore.getState().files).toEqual([]);
  });

  it("ignores an empty drop with zero files without showing the unsupported-type toast", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const imageArea = screen.getByLabelText(en.a11y.imageArea);
    fireEvent.drop(imageArea, {
      dataTransfer: { files: [], types: [] },
    });

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("appends valid dropped files on a multi-file tool while discarding unsupported ones", async () => {
    renderToolPage("/pdf/merge-pdf");

    const firstPdf = new File(["%PDF-1.4"], "first.pdf", { type: "application/pdf" });
    await act(async () => {
      useFileStore.getState().setFiles([firstPdf]);
    });

    const secondPdf = new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" });
    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const imageArea = screen.getByLabelText(en.a11y.imageArea);
    fireEvent.drop(imageArea, {
      dataTransfer: { files: [secondPdf, txtFile], types: ["Files"] },
    });

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([firstPdf, secondPdf]);
  });

  it("does not show the unsupported-type toast for a plain text paste with no file items", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    const event = makePasteEvent({
      files: [],
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });

  it("ignores file pastes on no-dropzone generator tools without showing a toast", async () => {
    await act(async () => {
      renderToolPage("/image/qr-generate");
    });

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = makePasteEvent({
      files: [txtFile],
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
  });

  it("shows the run-in-progress info toast when a supported file is dropped mid-run", async () => {
    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
      useFileStore.getState().setProcessing(true);
    });

    const nextPng = new File(["next-bytes"], "next.png", { type: "image/png" });
    const imageArea = screen.getByLabelText(en.a11y.imageArea);
    fireEvent.drop(imageArea, {
      dataTransfer: { files: [nextPng], types: ["Files"] },
    });

    expect(toastInfoSpy).toHaveBeenCalledTimes(1);
    expect(toastInfoSpy).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning, {
      id: "intake-ignored-while-running",
    });
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });
});

describe("ToolPage document paste readiness gate (#2844)", () => {
  it("ignores file pastes on an unknown 404 tool route without loading files or showing a toast", async () => {
    await act(async () => {
      renderToolPage("/image/nonexistent");
    });
    expect(screen.getByText(en.toolPage.notFound)).toBeTruthy();

    const png = new File(["png-bytes"], "photo.png", { type: "image/png" });
    const event = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([]);
  });

  it("ignores supported and unsupported file pastes when the tool is disabled by admin", async () => {
    useSettingsStore.setState({ disabledTools: ["resize"], loaded: true, loadError: false });
    await act(async () => {
      renderToolPage("/image/resize");
    });
    expect(screen.getByText(en.toolPage.disabledByAdmin)).toBeTruthy();

    const png = new File(["png-bytes"], "photo.png", { type: "image/png" });
    const supportedPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(supportedPaste);
    });

    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const unsupportedPaste = makePasteEvent({ files: [txt] });
    act(() => {
      document.dispatchEvent(unsupportedPaste);
    });

    expect(supportedPaste.defaultPrevented).toBe(false);
    expect(unsupportedPaste.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([]);
  });

  it("ignores file pastes while an AI tool is still loading feature bundle state", async () => {
    useFeaturesStore.setState({ bundles: [], loaded: false, loadError: false });
    vi.spyOn(useFeaturesStore.getState(), "fetch").mockResolvedValue(undefined);

    await act(async () => {
      renderToolPage("/image/remove-background");
    });
    expect(screen.getByText(en.common.loading)).toBeTruthy();

    const png = new File(["png-bytes"], "photo.png", { type: "image/png" });
    const supportedPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(supportedPaste);
    });

    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const unsupportedPaste = makePasteEvent({ files: [txt] });
    act(() => {
      document.dispatchEvent(unsupportedPaste);
    });

    expect(supportedPaste.defaultPrevented).toBe(false);
    expect(unsupportedPaste.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([]);
  });

  it("ignores supported and unsupported file pastes when an AI tool bundle is not installed, then accepts pastes once installed", async () => {
    useFeaturesStore.setState({
      loaded: true,
      loadError: false,
      bundles: [
        {
          id: "background-removal",
          name: "Background Removal",
          description: "Remove backgrounds",
          estimatedSize: "170 MB",
          enablesTools: ["remove-background"],
          status: "not_installed",
          installedVersion: null,
          progress: null,
          error: null,
        },
      ],
    });
    vi.spyOn(useFeaturesStore.getState(), "fetch").mockResolvedValue(undefined);

    await act(async () => {
      renderToolPage("/image/remove-background");
    });

    const png = new File(["png-bytes"], "photo.png", { type: "image/png" });
    const supportedPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(supportedPaste);
    });

    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const unsupportedPaste = makePasteEvent({ files: [txt] });
    act(() => {
      document.dispatchEvent(unsupportedPaste);
    });

    expect(supportedPaste.defaultPrevented).toBe(false);
    expect(unsupportedPaste.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([]);

    await act(async () => {
      useFeaturesStore.setState({
        bundles: [
          {
            id: "background-removal",
            name: "Background Removal",
            description: "Remove backgrounds",
            estimatedSize: "170 MB",
            enablesTools: ["remove-background"],
            status: "installed",
            installedVersion: "1.0.0",
            progress: null,
            error: null,
          },
        ],
      });
    });

    const installedPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(installedPaste);
    });

    expect(installedPaste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([png]);
  });

  it("ignores file pastes on a multi-bundle AI tool when only the primary bundle is installed, then accepts pastes once all required bundles are installed", async () => {
    useFeaturesStore.setState({
      loaded: true,
      loadError: false,
      bundles: [
        {
          id: "background-removal",
          name: "Background Removal",
          description: "Remove backgrounds",
          estimatedSize: "170 MB",
          enablesTools: ["remove-background", "passport-photo"],
          status: "installed",
          installedVersion: "1.0.0",
          progress: null,
          error: null,
        },
        {
          id: "face-detection",
          name: "Face Detection",
          description: "Detect faces",
          estimatedSize: "40 MB",
          enablesTools: ["blur-faces", "passport-photo"],
          status: "not_installed",
          installedVersion: null,
          progress: null,
          error: null,
        },
      ],
    });
    vi.spyOn(useFeaturesStore.getState(), "fetch").mockResolvedValue(undefined);

    await act(async () => {
      renderToolPage("/image/passport-photo");
    });

    const png = new File(["png-bytes"], "portrait.png", { type: "image/png" });
    const partialPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(partialPaste);
    });

    expect(partialPaste.defaultPrevented).toBe(false);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([]);

    await act(async () => {
      useFeaturesStore.setState({
        bundles: [
          {
            id: "background-removal",
            name: "Background Removal",
            description: "Remove backgrounds",
            estimatedSize: "170 MB",
            enablesTools: ["remove-background", "passport-photo"],
            status: "installed",
            installedVersion: "1.0.0",
            progress: null,
            error: null,
          },
          {
            id: "face-detection",
            name: "Face Detection",
            description: "Detect faces",
            estimatedSize: "40 MB",
            enablesTools: ["blur-faces", "passport-photo"],
            status: "installed",
            installedVersion: "1.0.0",
            progress: null,
            error: null,
          },
        ],
      });
    });

    const installedPaste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(installedPaste);
    });

    expect(installedPaste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([png]);
  });

  it("accepts file pastes on an AI tool with only optional bundles (ocr) once feature state is loaded", async () => {
    useFeaturesStore.setState({
      loaded: true,
      loadError: false,
      bundles: [],
    });
    vi.spyOn(useFeaturesStore.getState(), "fetch").mockResolvedValue(undefined);

    await act(async () => {
      renderToolPage("/image/ocr");
    });

    const png = new File(["png-bytes"], "scan.png", { type: "image/png" });
    const paste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(paste);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([png]);
  });
});

describe("ToolPage file paste intake (#2841)", () => {
  it("loads a single copy when pasting a file onto an empty multi-file tool page (#2841)", async () => {
    await act(async () => {
      renderToolPage("/pdf/merge-pdf");
    });

    const firstPdf = new File(["%PDF-1.4"], "first.pdf", { type: "application/pdf" });
    const firstPaste = makePasteEvent({ files: [firstPdf] });
    act(() => {
      document.dispatchEvent(firstPaste);
    });

    expect(firstPaste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([firstPdf]);
    expect(useFileStore.getState().entries).toHaveLength(1);

    const secondPdf = new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" });
    const secondPaste = makePasteEvent({ files: [secondPdf] });
    act(() => {
      document.dispatchEvent(secondPaste);
    });

    expect(secondPaste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([firstPdf, secondPdf]);
    expect(useFileStore.getState().entries).toHaveLength(2);
  });

  it("loads a single copy when pasting onto an empty mobile multi-file tool page (#2841)", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(375);
    await act(async () => {
      renderToolPage("/pdf/merge-pdf");
    });

    const pdf = new File(["%PDF-1.4"], "mobile.pdf", { type: "application/pdf" });
    const paste = makePasteEvent({ files: [pdf] });
    act(() => {
      document.dispatchEvent(paste);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([pdf]);
    expect(useFileStore.getState().entries).toHaveLength(1);
  });

  it("creates one entry without revoking a duplicate blob URL when pasting onto an empty single-file tool page (#2841)", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    await act(async () => {
      renderToolPage("/image/resize");
    });

    const png = new File(["png-bytes"], "photo.png", { type: "image/png" });
    const paste = makePasteEvent({ files: [png] });
    act(() => {
      document.dispatchEvent(paste);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(useFileStore.getState().files).toEqual([png]);
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:original-input-1");
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});

describe("ToolPage handleAddMore unsupported file intake (#2842)", () => {
  it("shows the unsupported-type toast when all files selected via + Add more fail toolFileFilter", async () => {
    let capturedInput: HTMLInputElement | null = null;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      if (this.type === "file") capturedInput = this;
    });

    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.addMore }));
    const input = capturedInput as HTMLInputElement | null;
    if (!input) throw new Error("expected file input");

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      value: [txtFile],
      configurable: true,
    });
    act(() => {
      input.onchange?.({ target: input } as unknown as Event);
    });

    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledWith(en.dropzone.unsupportedFileType, {
      id: "intake-unsupported-file-type",
    });
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("does not show the unsupported-type toast when the + Add more file dialog is cancelled", async () => {
    let capturedInput: HTMLInputElement | null = null;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      if (this.type === "file") capturedInput = this;
    });

    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.addMore }));
    const input = capturedInput as HTMLInputElement | null;
    if (!input) throw new Error("expected file input");

    Object.defineProperty(input, "files", {
      value: [],
      configurable: true,
    });
    act(() => {
      input.onchange?.({ target: input } as unknown as Event);
    });

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([initialPng]);
  });

  it("appends supported files and does not show the unsupported-type toast when + Add more receives a mixed selection", async () => {
    let capturedInput: HTMLInputElement | null = null;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      if (this.type === "file") capturedInput = this;
    });

    renderToolPage("/image/resize");

    const initialPng = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([initialPng]);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.addMore }));
    const input = capturedInput as HTMLInputElement | null;
    if (!input) throw new Error("expected file input");

    const secondPng = new File(["png-bytes-2"], "second.png", { type: "image/png" });
    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      value: [secondPng, txtFile],
      configurable: true,
    });
    act(() => {
      input.onchange?.({ target: input } as unknown as Event);
    });

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toEqual([initialPng, secondPng]);
  });
});

describe("ToolPage partial batch URL import (#3751)", () => {
  it.each(["desktop", "mobile"] as const)(
    "keeps UrlImportModal mounted with failed and fileFilter-rejected entries when a valid sibling URL transitions ToolPage from !hasFile to hasFile on %s (#3751)",
    async (viewport) => {
      if (viewport === "mobile") {
        vi.spyOn(window, "innerWidth", "get").mockReturnValue(375);
      }
      let fetchUrlsCalls = 0;
      let bDownloadCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/api/v1/fetch-urls")) {
            fetchUrlsCalls += 1;
            if (fetchUrlsCalls === 1) {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    results: [
                      {
                        success: true,
                        url: "https://example.com/a.png",
                        filename: "a.png",
                        size: 16,
                        downloadUrl: "https://example.com/dl/a.png",
                      },
                      {
                        success: true,
                        url: "https://example.com/b.png",
                        filename: "b.png",
                        size: 16,
                        downloadUrl: "https://example.com/dl/b.png",
                      },
                      {
                        success: true,
                        url: "https://example.com/notes.txt",
                        filename: "notes.txt",
                        size: 12,
                        downloadUrl: "https://example.com/dl/notes.txt",
                      },
                    ],
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } },
                ),
              );
            }
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  results: [
                    {
                      success: true,
                      url: "https://example.com/b.png",
                      filename: "b.png",
                      size: 16,
                      downloadUrl: "https://example.com/dl/b.png",
                    },
                  ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          if (url.endsWith("/dl/a.png")) {
            return Promise.resolve(
              new Response("png-a", { status: 200, headers: { "Content-Type": "image/png" } }),
            );
          }
          if (url.endsWith("/dl/b.png")) {
            bDownloadCalls += 1;
            if (bDownloadCalls === 1) {
              return Promise.resolve(new Response("Not found", { status: 404 }));
            }
            return Promise.resolve(
              new Response("png-b", { status: 200, headers: { "Content-Type": "image/png" } }),
            );
          }
          if (url.endsWith("/dl/notes.txt")) {
            return Promise.resolve(
              new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } }),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ authEnabled: false }), { status: 200 }),
          );
        }),
      );

      renderToolPage("/image/resize");

      fireEvent.click(screen.getByRole("button", { name: en.dropzone.importMultipleUrls }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByRole("textbox"), {
        target: {
          value:
            "https://example.com/a.png\nhttps://example.com/b.png\nhttps://example.com/notes.txt",
        },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: en.urlImport.importButton }));

      const firstAddBtn = await within(dialog).findByRole("button", { name: "Add 3 Files" });
      fireEvent.click(firstAddBtn);

      await waitFor(() => {
        expect(useFileStore.getState().entries.map((e: FileEntry) => e.file.name)).toEqual([
          "a.png",
        ]);
      });

      // ToolPage transitioned to the loaded workspace, while the same UrlImportModal instance stays mounted.
      expect(screen.getByLabelText(en.a11y.imageArea)).toBeTruthy();
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(within(dialog).queryByText("a.png")).toBeNull();
      expect(within(dialog).getByText("b.png")).toBeTruthy();
      expect(within(dialog).getByText("Download failed: 404")).toBeTruthy();
      expect(within(dialog).getByText("notes.txt")).toBeTruthy();
      expect(
        within(dialog).getByText("JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, TIF and 45 more"),
      ).toBeTruthy();

      // Retry b.png inside the still-open modal and import it alongside a.png.
      const retryButtons = within(dialog).getAllByTitle(en.urlImport.retryButton);
      expect(retryButtons).toHaveLength(2);
      fireEvent.click(retryButtons[0]);

      const secondAddBtn = await within(dialog).findByRole("button", { name: "Add 1 Files" });
      fireEvent.click(secondAddBtn);

      await waitFor(() => {
        expect(useFileStore.getState().entries.map((e: FileEntry) => e.file.name)).toEqual([
          "a.png",
          "b.png",
        ]);
      });

      // notes.txt remains visible as failed in the modal until closed or navigated away.
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(within(dialog).queryByText("b.png")).toBeNull();
      expect(within(dialog).getByText("notes.txt")).toBeTruthy();
      expect(
        within(dialog).getByText("JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, TIF and 45 more"),
      ).toBeTruthy();

      // Navigating to another tool closes the modal.
      fireEvent.click(screen.getByTestId("switch-tool"));
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("closes UrlImportModal automatically on ToolPage when all remaining failed entries succeed on retry (#3751)", async () => {
    let bDownloadCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/fetch-urls")) {
          const { urls = [] } = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                results: urls.map((u) => {
                  const filename = u.split("/").pop() ?? "file.txt";
                  return {
                    success: true,
                    url: u,
                    filename,
                    size: 10,
                    downloadUrl: `https://example.com/dl/${filename}`,
                  };
                }),
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.endsWith("/dl/a.txt")) {
          return Promise.resolve(
            new Response("txt-a", { status: 200, headers: { "Content-Type": "text/plain" } }),
          );
        }
        if (url.endsWith("/dl/b.txt")) {
          bDownloadCalls += 1;
          if (bDownloadCalls === 1) {
            return Promise.resolve(new Response("Not found", { status: 404 }));
          }
          return Promise.resolve(
            new Response("txt-b", { status: 200, headers: { "Content-Type": "text/plain" } }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ authEnabled: false }), { status: 200 }),
        );
      }),
    );

    renderToolPage("/files/create-zip");

    fireEvent.click(screen.getByRole("button", { name: en.dropzone.importMultipleUrls }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "https://example.com/a.txt\nhttps://example.com/b.txt" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: en.urlImport.importButton }));

    const firstAddBtn = await within(dialog).findByRole("button", { name: "Add 2 Files" });
    fireEvent.click(firstAddBtn);

    await waitFor(() => {
      expect(useFileStore.getState().entries.map((e: FileEntry) => e.file.name)).toEqual(["a.txt"]);
    });

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByText("b.txt")).toBeTruthy();
    expect(within(dialog).getByText("Download failed: 404")).toBeTruthy();

    fireEvent.click(within(dialog).getByTitle(en.urlImport.retryButton));
    const secondAddBtn = await within(dialog).findByRole("button", { name: "Add 1 Files" });
    fireEvent.click(secondAddBtn);

    await waitFor(() => {
      expect(useFileStore.getState().entries.map((e: FileEntry) => e.file.name)).toEqual([
        "a.txt",
        "b.txt",
      ]);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
