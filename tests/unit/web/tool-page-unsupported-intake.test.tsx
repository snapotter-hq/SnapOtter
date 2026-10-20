// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
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
import { useFileStore } from "@/stores/file-store";

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
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
