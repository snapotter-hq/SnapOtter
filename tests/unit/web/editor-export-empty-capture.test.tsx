// @vitest-environment jsdom

/**
 * Past the browser's canvas limit, Chromium and WebKit still hand out a canvas:
 * toDataURL() answers "data:," and toBlob() answers null. Export used to
 * download a 0-byte file and mark the document saved, which disarmed the
 * unsaved-work guard (#2140). A tainted canvas (a cross-origin image loaded
 * without CORS) throws SecurityError on read instead, which used to escape the
 * click handler and, from the preview effect, reach the route ErrorBoundary. A
 * failed capture now says so and leaves the document dirty.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const copyImageToClipboard = vi.hoisted(() => vi.fn(async () => true));
const capture = vi.hoisted(() => ({
  dataUrl: "data:image/png;base64,AA==",
  blob: new Blob(["x"]) as Blob | null,
  throwOnEncode: null as Error | null,
  ratios: [] as number[],
  // jsdom has no 2D context. The file is built on a canvas the dialog creates, so
  // that canvas is faked too; `giveContext: false` is the browser past its limit.
  giveContext: true,
}));

const fakeCanvas = vi.hoisted(() => (width: number, height: number) => ({
  width,
  height,
  // A healthy canvas: the dead-canvas probe reads back an opaque pixel.
  getContext: () =>
    capture.giveContext
      ? {
          fillStyle: "",
          fillRect: () => {},
          drawImage: () => {},
          createImageData: () => ({ data: new Uint8ClampedArray(4) }),
          getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 255, 255]) }),
          putImageData: () => {},
        }
      : null,
  toDataURL: () => {
    if (capture.throwOnEncode) throw capture.throwOnEncode;
    return capture.dataUrl;
  },
  toBlob: (cb: (blob: Blob | null) => void) => {
    if (capture.throwOnEncode) throw capture.throwOnEncode;
    cb(capture.blob);
  },
}));

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyImageToClipboard };
});
vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/components/editor/editor-canvas", () => ({ editorStageRefHolder: { current: {} } }));
vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  captureDocumentCanvas: (_stage: unknown, w: number, h: number, ratio = 1) => {
    capture.ratios.push(ratio);
    // Konva's drawImage of a layer canvas with a 0 px side throws InvalidStateError.
    if (Math.floor(w * ratio) < 1 || Math.floor(h * ratio) < 1) {
      throw new DOMException("The object is in an invalid state.", "InvalidStateError");
    }
    return fakeCanvas(Math.floor(w * ratio), Math.floor(h * ratio));
  },
}));

import { defaultCurvesState, defaultLevelsState } from "@/components/editor/adjustment-lut";
import {
  clearAutosave,
  ExportDialog,
  loadAutosaveState,
  restoreAutosave,
  saveEditorState,
} from "@/components/editor/common/export-dialog";
import { captureHandledError } from "@/lib/analytics";
import { useEditorStore } from "@/stores/editor-store";

const markClean = vi.fn();
const TOO_LARGE = en.editor.ui.exportDialog.tooLarge;
const TAINTED = en.editor.ui.captureFailure.crossOriginBlocked;
let createdFileInputs: HTMLInputElement[] = [];

beforeEach(() => {
  markClean.mockReset();
  toastError.mockReset();
  copyImageToClipboard.mockClear();
  vi.mocked(captureHandledError).mockClear();
  capture.dataUrl = "data:image/png;base64,AA==";
  capture.blob = new Blob(["x"]);
  capture.throwOnEncode = null;
  capture.ratios = [];
  capture.giveContext = true;
  createdFileInputs = [];
  useEditorStore.setState({
    markClean,
    isDirty: true,
    canvasSize: { width: 1920, height: 1080 },
    sourceImageUrl: null,
    sourceImageSize: null,
    objects: [],
    levels: defaultLevelsState(),
    curves: defaultCurvesState(),
  });
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "canvas") {
      return fakeCanvas(0, 0) as unknown as HTMLCanvasElement;
    }
    const el = realCreate(tag);
    if (tag === "input" && !el.isConnected) {
      createdFileInputs.push(el as HTMLInputElement);
    }
    return el;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      // A data URL of "data:," fetches as a zero-byte blob.
      blob: async () => (url === "data:," ? new Blob([]) : new Blob(["x"])),
      json: async () => ({ downloadUrl: "/api/v1/download/job/export.avif" }),
    })),
  );
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const taintedError = () => new DOMException("tainted", "SecurityError");

function clickExport() {
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.exportButton }));
}

function clickCopy() {
  fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
}

describe("export of a canvas the browser could not back (#2140)", () => {
  it("marks the document clean after a good export", async () => {
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports an empty data URL and leaves the document dirty", async () => {
    capture.dataUrl = "data:,";
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports a zero-byte blob and leaves the document dirty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ blob: async () => new Blob([]) })),
    );
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports a failed capture on the server-convert path too", async () => {
    capture.blob = null;
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
  });

  it("reports a zero-byte blob on the server-convert path", async () => {
    capture.blob = new Blob([]);
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
  });
});

describe("export of a tainted canvas (#2140)", () => {
  it("opens without crashing: the preview effect swallows the SecurityError", () => {
    capture.throwOnEncode = taintedError();
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
  });

  it("tells the user instead of throwing out of the click handler", async () => {
    render(<ExportDialog onClose={() => {}} />);
    capture.throwOnEncode = taintedError();
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TAINTED, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
  });
});

describe("copy of a canvas that can't be encoded (#2140)", () => {
  it("copies a good capture", async () => {
    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports an empty capture instead of copying an empty image", async () => {
    capture.dataUrl = "data:,";
    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(copyImageToClipboard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.editor.ui.exportDialog.copyFailed })).toBeTruthy();
  });

  it("reports a tainted capture instead of throwing", async () => {
    render(<ExportDialog onClose={() => {}} />);
    capture.throwOnEncode = taintedError();
    clickCopy();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TAINTED, expect.anything()));
    expect(copyImageToClipboard).not.toHaveBeenCalled();
  });

  it("shows an error toast and reports a bug on an unexpected capture error in Copy", async () => {
    capture.throwOnEncode = new TypeError("a real bug");
    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(copyImageToClipboard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.editor.ui.exportDialog.copyFailed })).toBeTruthy();
  });
});

describe("a size that rounds to 0 px (#2140)", () => {
  // Typing "1" into the width of a wide image commits width 1 on the first
  // keystroke; the height rounds to 0 and Konva throws InvalidStateError. That
  // used to escape the preview effect and replace the editor with the crash screen.
  it("keeps the dialog open and captures at least 1 px on every side", async () => {
    useEditorStore.setState({ canvasSize: { width: 800, height: 200 } });
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "1" } });
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
    const before = capture.ratios.length;
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    // The estimate now waits for typing to stop (#2174), so the 1 px capture to check
    // is the export's own.
    expect(capture.ratios.length).toBeGreaterThan(before);
    for (const ratio of capture.ratios) {
      expect(Math.floor(800 * ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(200 * ratio)).toBeGreaterThanOrEqual(1);
    }
  });

  it("opens on a document far wider than the 200 px thumbnail is tall", () => {
    useEditorStore.setState({ canvasSize: { width: 40000, height: 100 } });
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
  });

  it("blanks the preview instead of crashing on an error that is not a known capture failure", () => {
    capture.throwOnEncode = new TypeError("something unexpected");
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
  });
});

describe("a 2D context the browser won't give (#2140)", () => {
  // A null 2D context on the canvas the file is built on is the same branch a
  // browser at its limit takes.
  beforeEach(() => {
    capture.giveContext = false;
  });

  it("reports the white-background JPEG path instead of returning silently", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "JPEG" }));
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
  });

  it("reports the server-convert path with a solid background too", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    fireEvent.click(screen.getByText(en.editor.ui.exportDialog.transparentBackground));
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(markClean).not.toHaveBeenCalled();
  });
});

describe("export failures that reach the catch block (#2351)", () => {
  it("shows an error toast and reports a bug when fetch(dataUrl) fails", async () => {
    // Make fetch reject to simulate a failed download
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }),
    );
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    // Wait for the toast to be called with exportFailed
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(markClean).not.toHaveBeenCalled();
  });

  it("shows an error toast and reports a bug on an unexpected capture error", async () => {
    capture.throwOnEncode = new TypeError("a real bug");
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    // Wait for the toast to be called with exportFailed
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(markClean).not.toHaveBeenCalled();
  });
});

function clickSaveProject() {
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.saveProject }));
}

async function savedProjectJson(): Promise<Record<string, unknown>> {
  const calls = vi.mocked(URL.createObjectURL).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const blob = calls[calls.length - 1][0] as Blob;
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  return JSON.parse(text) as Record<string, unknown>;
}

describe("Save Project with a blob: source image (#2132)", () => {
  it("converts blob: sourceImageUrl and image objects to data: URLs before writing and marking clean", async () => {
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/source-1",
      sourceImageSize: { width: 1920, height: 1080 },
      objects: [
        {
          id: "obj-1",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: "blob:http://localhost:1351/stroke-1",
            image: {} as HTMLCanvasElement,
          },
        },
        {
          id: "obj-2",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 10,
            y: 10,
            width: 50,
            height: 50,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: "data:image/png;base64,iVBORw0KGgo=",
          },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        blob: async () => new Blob([`pixels:${url}`], { type: "image/png" }),
      })),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    const project = await savedProjectJson();
    expect(project.sourceImageUrl).toMatch(/^data:image\/png;base64,/);
    const objects = project.objects as Array<{ attrs: { src: string; image?: unknown } }>;
    expect(objects[0].attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(objects[0].attrs.image).toBeUndefined();
    expect(objects[1].attrs.src).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("leaves a data: sourceImageUrl untouched without fetching it", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    useEditorStore.setState({
      sourceImageUrl: dataUrl,
      sourceImageSize: { width: 1920, height: 1080 },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(fetchSpy).not.toHaveBeenCalled();
    const project = await savedProjectJson();
    expect(project.sourceImageUrl).toBe(dataUrl);
  });

  it("saves null sourceImageUrl when no source image is loaded", async () => {
    useEditorStore.setState({
      sourceImageUrl: null,
      sourceImageSize: null,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(fetchSpy).not.toHaveBeenCalled();
    const project = await savedProjectJson();
    expect(project.sourceImageUrl).toBeNull();
  });

  it("does not mark clean if the document changes while Save Project is reading the blob", async () => {
    let resolveBlob: (blob: Blob) => void = () => {};
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/slow-source",
      sourceImageSize: { width: 1920, height: 1080 },
      _historyVersion: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: () =>
          new Promise<Blob>((resolve) => {
            resolveBlob = resolve;
          }),
      })),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    useEditorStore.setState({ _historyVersion: 2 });
    resolveBlob(new Blob(["pixels"], { type: "image/png" }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(markClean).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when fetching the blob: sourceImageUrl rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/revoked",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when an image object's blob: src fails to fetch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 1920, height: 1080 },
      objects: [
        {
          id: "obj-broken",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: "blob:http://localhost:1351/broken-stroke",
          },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when the blob: URL resolves to an empty blob", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/empty",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([]),
      })),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when fetching the blob: URL answers not ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/missing",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        blob: async () => new Blob(["not found"]),
      })),
    );

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when FileReader fails on the blob: URL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/unreadable",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("toasts and keeps the document dirty when FileReader finishes with an empty data URL payload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/truncated",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, "result", {
        value: "data:image/png;base64,",
        configurable: true,
      });
      this.onloadend?.(new ProgressEvent("loadend") as ProgressEvent<FileReader>);
    });

    render(<ExportDialog onClose={() => {}} />);
    clickSaveProject();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not overwrite autosave in localStorage with a dead blob: URL when fetch fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/revoked",
      sourceImageSize: { width: 1920, height: 1080 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await saveEditorState();
    expect(localStorage.getItem("snapotter-editor-autosave")).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

function pickProjectFile(content: string, name = "bad.snapotter") {
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.loadProject }));
  const fileInputs = createdFileInputs.filter((input) => input.type === "file");
  const input = fileInputs[fileInputs.length - 1];
  expect(input).toBeDefined();
  const file = new File([content], name, { type: "application/json" });
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

describe("Load Project (#1622)", () => {
  it("surfaces invalidProject, logs at debug level, and keeps the dialog open on malformed JSON", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile("{truncated");

    const expectedMsg = en.editor.ui.exportDialog.invalidProject;
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expectedMsg));
    expect(toastError).toHaveBeenCalledWith(expectedMsg);
    expect(debugSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it.each([
    ["missing version and canvasSize", JSON.stringify({ hello: "world" })],
    ["missing version", JSON.stringify({ canvasSize: { width: 800, height: 600 } })],
    [
      "unsupported version",
      JSON.stringify({ version: 2, canvasSize: { width: 800, height: 600 } }),
    ],
    ["missing canvasSize", JSON.stringify({ version: 1 })],
    [
      "invalid canvasSize dimensions",
      JSON.stringify({ version: 1, canvasSize: { width: 0, height: 600 } }),
    ],
    ["non-object JSON root", JSON.stringify(null)],
    [
      "empty layers array",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, layers: [] }),
    ],
    [
      "layer without id",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, layers: [{}] }),
    ],
    [
      "non-array objects",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, objects: "bad" }),
    ],
    [
      "non-array filters",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, filters: {} }),
    ],
    [
      "non-array guides",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, guides: 42 }),
    ],
    [
      "non-object adjustments",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, adjustments: [] }),
    ],
    [
      "invalid sourceImageUrl",
      JSON.stringify({ version: 1, canvasSize: { width: 800, height: 600 }, sourceImageUrl: 123 }),
    ],
    [
      "invalid sourceImageSize",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        sourceImageSize: { width: -1, height: 100 },
      }),
    ],
    ["array JSON root", JSON.stringify([1, 2, 3])],
    [
      "layer with empty id",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        layers: [
          { id: "", name: "L1", visible: true, locked: false, opacity: 1, blendMode: "normal" },
        ],
      }),
    ],
    [
      "layer missing required fields",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        layers: [{ id: "layer-1" }],
      }),
    ],
    [
      "malformed object item",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        objects: [{}],
      }),
    ],
    [
      "malformed filter item",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        filters: [{ type: "blur", enabled: true }],
      }),
    ],
    [
      "malformed guide item",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        guides: [{ id: "g1", orientation: "diagonal", position: 10 }],
      }),
    ],
    [
      "non-numeric adjustment value",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        adjustments: { brightness: "high" },
      }),
    ],
    [
      "invalid foregroundColor",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        foregroundColor: "not-a-color",
      }),
    ],
    [
      "invalid backgroundColor",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        backgroundColor: 123,
      }),
    ],
  ])(
    "surfaces invalidProject and leaves the store untouched when project JSON has %s",
    async (_label, content) => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const onClose = vi.fn();
      render(<ExportDialog onClose={onClose} />);

      pickProjectFile(content);

      const expectedMsg = en.editor.ui.exportDialog.invalidProject;
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expectedMsg));
      expect(toastError).toHaveBeenCalledWith(expectedMsg);
      expect(debugSpy).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(useEditorStore.getState().canvasSize).toEqual({ width: 1920, height: 1080 });
      expect(useEditorStore.getState().isDirty).toBe(true);
    },
  );

  it("surfaces invalidProject when FileReader fails to read the project file", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile("{}");

    const expectedMsg = en.editor.ui.exportDialog.invalidProject;
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expectedMsg));
    expect(toastError).toHaveBeenCalledWith(expectedMsg);
    expect(debugSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it("clears the inline error when Load Project is clicked again and aborts an in-flight read on unmount", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const onClose = vi.fn();
    const { unmount } = render(<ExportDialog onClose={onClose} />);

    pickProjectFile("{truncated");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(en.editor.ui.exportDialog.invalidProject),
    );

    let capturedReader: FileReader | null = null;
    vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      capturedReader = this;
    });

    fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.loadProject }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const fileInputs = createdFileInputs.filter((input) => input.type === "file");
    const input = fileInputs[fileInputs.length - 1];
    Object.defineProperty(input, "files", {
      value: [
        new File(
          [JSON.stringify({ version: 1, canvasSize: { width: 500, height: 400 } })],
          "good.snapotter",
          { type: "application/json" },
        ),
      ],
      configurable: true,
    });
    fireEvent.change(input);
    if (!capturedReader) throw new Error("Expected FileReader instance");
    const readerInstance: FileReader = capturedReader;

    unmount();
    Object.defineProperty(readerInstance, "result", {
      value: JSON.stringify({ version: 1, canvasSize: { width: 500, height: 400 } }),
      configurable: true,
    });
    readerInstance.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    expect(onClose).not.toHaveBeenCalled();
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 1920, height: 1080 });
  });

  it("loads a valid project without clearing isDirty on an unsaved document and updates activeLayerId", async () => {
    const onClose = vi.fn();
    useEditorStore.setState({
      isDirty: true,
      activeLayerId: "old-layer",
      clipboard: [
        {
          id: "clip-1",
          type: "rect",
          layerId: "old-layer",
          attrs: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          },
        },
      ],
    });
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 640, height: 480 },
        layers: [
          {
            id: "loaded-layer-1",
            name: "Background",
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: "normal",
            thumbnail: null,
          },
        ],
        objects: [],
        sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
        sourceImageSize: { width: 640, height: 480 },
      }),
      "good.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    const state = useEditorStore.getState();
    expect(state.canvasSize).toEqual({ width: 640, height: 480 });
    expect(state.activeLayerId).toBe("loaded-layer-1");
    expect(state.clipboard).toBeNull();
    expect(state.isDirty).toBe(true);
    expect(state.lastAction).toEqual({ id: "loadProject" });
  });

  it("keeps isDirty false when loading a valid project into a clean document", async () => {
    const onClose = vi.fn();
    useEditorStore.setState({ isDirty: false });
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 640, height: 480 },
      }),
      "good.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().isDirty).toBe(false);
  });

  it("preserves activeLayerId when the loaded project layers include it and merges partial adjustments and filters", async () => {
    const onClose = vi.fn();
    useEditorStore.setState({
      isDirty: false,
      activeLayerId: "kept-layer",
    });
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 640, height: 480 },
        layers: [
          {
            id: "first-layer",
            name: "Layer 1",
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: "normal",
            thumbnail: null,
          },
          {
            id: "kept-layer",
            name: "Layer 2",
            visible: true,
            locked: false,
            opacity: 0.8,
            blendMode: "normal",
            thumbnail: null,
          },
        ],
        adjustments: { brightness: 25 },
        filters: [{ type: "blur", enabled: true, params: { radius: 8 } }],
      }),
      "good.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const state = useEditorStore.getState();
    expect(state.activeLayerId).toBe("kept-layer");
    expect(state.adjustments.brightness).toBe(25);
    expect(state.adjustments.contrast).toBe(0);
    expect(state.filters.length).toBeGreaterThan(1);
    expect(state.filters.find((f) => f.type === "blur")).toEqual({
      type: "blur",
      enabled: true,
      params: { radius: 8 },
    });
  });

  it("cancels an earlier in-flight FileReader when a second project file is selected", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const readers: FileReader[] = [];
    vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      readers.push(this);
    });
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile("{broken-first");
    pickProjectFile(JSON.stringify({ version: 1, canvasSize: { width: 512, height: 512 } }));
    expect(readers).toHaveLength(2);

    Object.defineProperty(readers[0], "result", {
      value: "{broken-first",
      configurable: true,
    });
    readers[0].onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    expect(toastError).not.toHaveBeenCalled();

    Object.defineProperty(readers[1], "result", {
      value: JSON.stringify({ version: 1, canvasSize: { width: 512, height: 512 } }),
      configurable: true,
    });
    readers[1].onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 512, height: 512 });
  });

  it("reports an unexpected error during state application via handleUnexpectedError instead of invalidProject", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn(() => {
      throw new TypeError("unexpected teardown failure");
    });
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 640, height: 480 },
      }),
      "good.snapotter",
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("round-trips levels and curves through Save Project and Load Project (#2654)", async () => {
    const editedLevels = {
      ...defaultLevelsState(),
      rgb: { blackPoint: 12, whitePoint: 240, gamma: 1.4, outBlack: 5, outWhite: 250 },
      red: { blackPoint: 20, whitePoint: 220, gamma: 0.8, outBlack: 10, outWhite: 245 },
    };
    const editedCurves = {
      ...defaultCurvesState(),
      rgb: [
        { x: 0, y: 15 },
        { x: 128, y: 160 },
        { x: 255, y: 240 },
      ],
      blue: [
        { x: 0, y: 255 },
        { x: 255, y: 0 },
      ],
    };
    useEditorStore.setState({
      levels: editedLevels,
      curves: editedCurves,
    });

    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);
    clickSaveProject();

    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    const saved = await savedProjectJson();
    expect(saved.levels).toEqual(editedLevels);
    expect(saved.curves).toEqual(editedCurves);

    useEditorStore.setState({
      levels: defaultLevelsState(),
      curves: defaultCurvesState(),
    });

    pickProjectFile(JSON.stringify(saved), "roundtrip.snapotter");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(useEditorStore.getState().levels).toEqual(editedLevels);
    expect(useEditorStore.getState().curves).toEqual(editedCurves);
  });

  it("resets levels and curves to defaults when loading a legacy v1 project without them (#2654)", async () => {
    const staleLevels = {
      ...defaultLevelsState(),
      rgb: { blackPoint: 40, whitePoint: 200, gamma: 2, outBlack: 0, outWhite: 255 },
    };
    const staleCurves = {
      ...defaultCurvesState(),
      green: [
        { x: 0, y: 50 },
        { x: 255, y: 200 },
      ],
    };
    useEditorStore.setState({
      levels: staleLevels,
      curves: staleCurves,
    });

    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);
    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
      }),
      "legacy.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().levels).toEqual(defaultLevelsState());
    expect(useEditorStore.getState().curves).toEqual(defaultCurvesState());
  });

  it("round-trips levels and curves through autosave and resets them on legacy autosaves (#2654)", async () => {
    const staleLevels = {
      ...defaultLevelsState(),
      rgb: { blackPoint: 40, whitePoint: 200, gamma: 2, outBlack: 0, outWhite: 255 },
    };
    const staleCurves = {
      ...defaultCurvesState(),
      green: [
        { x: 0, y: 50 },
        { x: 255, y: 200 },
      ],
    };
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    useEditorStore.setState({
      levels: staleLevels,
      curves: staleCurves,
    });
    await saveEditorState();
    const autosaved = loadAutosaveState();
    if (!autosaved) throw new Error("Expected autosave state");
    expect(autosaved.state.levels).toEqual(staleLevels);
    expect(autosaved.state.curves).toEqual(staleCurves);

    useEditorStore.setState({
      levels: defaultLevelsState(),
      curves: defaultCurvesState(),
    });
    act(() => {
      restoreAutosave(autosaved);
    });
    expect(useEditorStore.getState().levels).toEqual(staleLevels);
    expect(useEditorStore.getState().curves).toEqual(staleCurves);

    // Legacy autosave payload omitting levels/curves resets them to defaults
    const legacyState = { ...autosaved.state } as Record<string, unknown>;
    delete legacyState.levels;
    delete legacyState.curves;
    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: Date.now(),
        state: legacyState as unknown as typeof autosaved.state,
      });
    });
    expect(useEditorStore.getState().levels).toEqual(defaultLevelsState());
    expect(useEditorStore.getState().curves).toEqual(defaultCurvesState());
  });

  it("normalizes partial levels channels and unsorted curve points on Load Project (#2654)", async () => {
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);
    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: {
          rgb: { blackPoint: 15, outBlack: 100, outWhite: 100 },
        },
        curves: {
          red: [
            { x: 255, y: 240, extra: "ignored" },
            { x: 0, y: 10 },
            { x: 128, y: 150 },
          ],
        },
      }),
      "partial.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().levels).toEqual({
      ...defaultLevelsState(),
      rgb: { blackPoint: 15, whitePoint: 255, gamma: 1, outBlack: 100, outWhite: 100 },
    });
    expect(useEditorStore.getState().curves).toEqual({
      ...defaultCurvesState(),
      red: [
        { x: 0, y: 10 },
        { x: 128, y: 150 },
        { x: 255, y: 240 },
      ],
    });
  });

  it.each([
    [
      "non-object levels",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: "invalid",
      }),
    ],
    [
      "unknown levels channel",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { alpha: { blackPoint: 0, whitePoint: 255, gamma: 1, outBlack: 0, outWhite: 255 } },
      }),
    ],
    [
      "unknown key inside levels channel",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { blackPoint: 10, extraKey: 5 } },
      }),
    ],
    [
      "non-numeric levels field",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { blackPoint: "low" } },
      }),
    ],
    [
      "inverted levels blackPoint >= whitePoint",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { blackPoint: 200, whitePoint: 100 } },
      }),
    ],
    [
      "equal levels blackPoint and whitePoint",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { blackPoint: 100, whitePoint: 100 } },
      }),
    ],
    [
      "inverted levels outBlack > outWhite",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { outBlack: 200, outWhite: 100 } },
      }),
    ],
    [
      "out-of-range levels gamma below 0.01",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { gamma: 0 } },
      }),
    ],
    [
      "out-of-range levels gamma above 10",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        levels: { rgb: { gamma: 15 } },
      }),
    ],
    [
      "non-object curves",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        curves: [],
      }),
    ],
    [
      "unknown curves channel",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        curves: {
          r: [
            { x: 0, y: 0 },
            { x: 255, y: 255 },
          ],
        },
      }),
    ],
    [
      "curves channel with fewer than 2 points",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        curves: { rgb: [{ x: 0, y: 0 }] },
      }),
    ],
    [
      "curves point with out-of-range coordinate",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        curves: {
          rgb: [
            { x: 0, y: 0 },
            { x: 300, y: 255 },
          ],
        },
      }),
    ],
    [
      "curves channel with duplicate x coordinates",
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
        curves: {
          rgb: [
            { x: 100, y: 50 },
            { x: 100, y: 200 },
          ],
        },
      }),
    ],
  ])("rejects project JSON with %s and preserves store state (#2654)", async (_label, content) => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const priorLevels = {
      ...defaultLevelsState(),
      rgb: { blackPoint: 18, whitePoint: 235, gamma: 1.2, outBlack: 0, outWhite: 255 },
    };
    const priorCurves = {
      ...defaultCurvesState(),
      blue: [
        { x: 0, y: 25 },
        { x: 255, y: 230 },
      ],
    };
    useEditorStore.setState({
      levels: priorLevels,
      curves: priorCurves,
    });
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(content);

    const expectedMsg = en.editor.ui.exportDialog.invalidProject;
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expectedMsg));
    expect(toastError).toHaveBeenCalledWith(expectedMsg);
    expect(onClose).not.toHaveBeenCalled();
    expect(useEditorStore.getState().levels).toEqual(priorLevels);
    expect(useEditorStore.getState().curves).toEqual(priorCurves);
  });
});

describe("Autosave validation and state reconciliation (#2658)", () => {
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    });
  });

  it("logs at debug level, clears localStorage, and returns null on malformed autosave JSON", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    localStorage.setItem("snapotter-editor-autosave", "{not-valid-json");

    expect(loadAutosaveState()).toBeNull();
    expect(debugSpy).toHaveBeenCalled();
    expect(localStorage.getItem("snapotter-editor-autosave")).toBeNull();
  });

  it("logs at debug level and returns null when localStorage.getItem throws", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("Storage disabled", "SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });

    expect(loadAutosaveState()).toBeNull();
    expect(debugSpy).toHaveBeenCalled();
  });

  it("logs at debug level when localStorage.removeItem throws in clearAutosave", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new DOMException("Storage disabled", "SecurityError");
      },
      clear: () => {},
    });

    expect(() => clearAutosave()).not.toThrow();
    expect(debugSpy).toHaveBeenCalled();
  });

  it.each([
    ["non-object root", JSON.stringify(null)],
    [
      "unsupported version",
      JSON.stringify({
        version: 2,
        timestamp: 1000,
        state: { canvasSize: { width: 800, height: 600 } },
      }),
    ],
    [
      "missing timestamp",
      JSON.stringify({ version: 1, state: { canvasSize: { width: 800, height: 600 } } }),
    ],
    [
      "non-numeric timestamp",
      JSON.stringify({
        version: 1,
        timestamp: "now",
        state: { canvasSize: { width: 800, height: 600 } },
      }),
    ],
    [
      "zero or negative timestamp",
      JSON.stringify({
        version: 1,
        timestamp: 0,
        state: { canvasSize: { width: 800, height: 600 } },
      }),
    ],
    ["non-object state", JSON.stringify({ version: 1, timestamp: 1000, state: "bad" })],
    [
      "zero/negative canvasSize",
      JSON.stringify({
        version: 1,
        timestamp: 1000,
        state: { canvasSize: { width: 0, height: -5 } },
      }),
    ],
    [
      "empty layers array",
      JSON.stringify({
        version: 1,
        timestamp: 1000,
        state: { canvasSize: { width: 800, height: 600 }, layers: [] },
      }),
    ],
    [
      "malformed layer in state",
      JSON.stringify({
        version: 1,
        timestamp: 1000,
        state: { canvasSize: { width: 800, height: 600 }, layers: [{ id: "layer-only" }] },
      }),
    ],
    [
      "invalid foregroundColor in state",
      JSON.stringify({
        version: 1,
        timestamp: 1000,
        state: { canvasSize: { width: 800, height: 600 }, foregroundColor: "not-hex" },
      }),
    ],
  ])("rejects, logs at debug, and clears autosave when payload has %s", (_label, raw) => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    localStorage.setItem("snapotter-editor-autosave", raw);

    expect(loadAutosaveState()).toBeNull();
    expect(debugSpy).toHaveBeenCalled();
    expect(localStorage.getItem("snapotter-editor-autosave")).toBeNull();
  });

  it("reconciles activeLayerId and resets transient selection, crop, text-editing, and clipboard state in restoreAutosave", () => {
    useEditorStore.setState({
      isDirty: false,
      activeLayerId: "layer-current",
      selection: { x: 10, y: 10, width: 50, height: 50, type: "rect" },
      cropState: { x: 0, y: 0, width: 100, height: 100, aspectRatio: null },
      isCropping: true,
      editingTextId: "obj-1",
      selectedObjectIds: ["obj-1"],
      clipboard: [
        {
          id: "clip-1",
          type: "rect",
          layerId: "layer-current",
          attrs: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          },
        },
      ],
      _historyVersion: 4,
    });

    const savedLayer = {
      id: "layer-saved",
      name: "Saved Layer",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "source-over" as const,
      thumbnail: null,
    };

    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: 1700000000000,
        state: {
          canvasSize: { width: 1024, height: 768 },
          layers: [savedLayer],
          objects: [],
          adjustments: {
            brightness: 10,
            contrast: 0,
            hue: 0,
            saturation: 0,
            luminance: 0,
            exposure: 0,
            vibrance: 0,
            warmth: 0,
          },
          filters: [],
          levels: defaultLevelsState(),
          curves: defaultCurvesState(),
          guides: [],
          sourceImageUrl: null,
          sourceImageSize: null,
          foregroundColor: "#112233",
          backgroundColor: "#445566",
        },
      });
    });

    const state = useEditorStore.getState();
    expect(state.canvasSize).toEqual({ width: 1024, height: 768 });
    expect(state.activeLayerId).toBe("layer-saved");
    expect(state.selection).toBeNull();
    expect(state.cropState).toBeNull();
    expect(state.isCropping).toBe(false);
    expect(state.editingTextId).toBeNull();
    expect(state.selectedObjectIds).toEqual([]);
    expect(state.clipboard).toBeNull();
    expect(state.isDirty).toBe(true);
    expect(state.lastAction).toEqual({ id: "restoreAutosave" });
    expect(state._historyVersion).toBe(5);
  });

  it("preserves activeLayerId when the restored autosave layers still contain it", () => {
    useEditorStore.setState({
      activeLayerId: "layer-keep",
    });

    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: 1700000000000,
        state: {
          canvasSize: { width: 800, height: 600 },
          layers: [
            {
              id: "layer-first",
              name: "Layer 1",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "source-over",
              thumbnail: null,
            },
            {
              id: "layer-keep",
              name: "Layer 2",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "source-over",
              thumbnail: null,
            },
          ],
          objects: [],
          adjustments: useEditorStore.getState().adjustments,
          filters: useEditorStore.getState().filters,
          levels: defaultLevelsState(),
          curves: defaultCurvesState(),
          guides: [],
          sourceImageUrl: null,
          sourceImageSize: null,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
        },
      });
    });

    expect(useEditorStore.getState().activeLayerId).toBe("layer-keep");
  });

  it("normalizes partial adjustments, partial filters, omitted optional fields, and ignores unknown state keys in restoreAutosave", () => {
    useEditorStore.setState({
      objects: [
        {
          id: "stale-obj",
          type: "rect",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          },
        },
      ],
      guides: [{ id: "stale-guide", orientation: "horizontal", position: 100 }],
      foregroundColor: "#abcdef",
      backgroundColor: "#fedcba",
    });

    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: 1700000000000,
        state: {
          canvasSize: { width: 640, height: 480 },
          adjustments: { brightness: 30 },
          filters: [{ type: "blur", enabled: true, params: { radius: 12 } }],
          unexpectedKey: "should-not-leak",
        } as unknown as Parameters<typeof restoreAutosave>[0]["state"],
      });
    });

    const state = useEditorStore.getState() as unknown as Record<string, unknown>;
    expect(state.canvasSize).toEqual({ width: 640, height: 480 });
    expect(state.objects).toEqual([]);
    expect(state.guides).toEqual([]);
    expect(state.foregroundColor).toBe("#000000");
    expect(state.backgroundColor).toBe("#ffffff");
    expect(useEditorStore.getState().adjustments.brightness).toBe(30);
    expect(useEditorStore.getState().adjustments.contrast).toBe(0);
    expect(useEditorStore.getState().filters.length).toBeGreaterThan(1);
    expect(useEditorStore.getState().filters.find((f) => f.type === "blur")).toEqual({
      type: "blur",
      enabled: true,
      params: { radius: 12 },
    });
    expect(state.unexpectedKey).toBeUndefined();
  });
});
