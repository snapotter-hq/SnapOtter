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
const copyImageToClipboard = vi.hoisted(() =>
  vi.fn<(blob: Blob | Promise<Blob>, type?: string) => Promise<boolean>>(async () => true),
);
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
  AutosaveRecoveryBanner,
  clearAutosave,
  ExportDialog,
  loadAutosaveState,
  restoreAutosave,
  saveEditorState,
  useAutosave,
} from "@/components/editor/common/export-dialog";
import { captureHandledError } from "@/lib/analytics";
import {
  createDefaultAdjustments,
  createDefaultFilters,
  createDefaultLayers,
  useEditorStore,
} from "@/stores/editor-store";

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
    layers: createDefaultLayers(),
    activeLayerId: "layer-1",
    objects: [],
    adjustments: createDefaultAdjustments(),
    filters: createDefaultFilters(),
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

describe("copy of a canvas that can't be encoded (#2140, #1979)", () => {
  it("copies a good capture", async () => {
    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("calls copyImageToClipboard synchronously before fetch(dataUrl) resolves so WebKit keeps the user gesture (#1979)", async () => {
    let resolveFetch!: (res: { ok: boolean; blob: () => Promise<Blob> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    copyImageToClipboard.mockImplementationOnce(async (blob) => {
      const resolved = await blob;
      return resolved.size > 0;
    });

    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    // Must be called synchronously inside the click handler, before fetch resolves.
    expect(copyImageToClipboard).toHaveBeenCalledTimes(1);
    expect(copyImageToClipboard.mock.calls[0][0]).toBeInstanceOf(Promise);

    resolveFetch({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: en.editor.ui.exportDialog.copied })).toBeTruthy(),
    );
  });

  it("shows copyFailed on the button when copyImageToClipboard resolves false (#1979)", async () => {
    copyImageToClipboard.mockResolvedValueOnce(false);
    render(<ExportDialog onClose={() => {}} />);
    clickCopy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: en.editor.ui.exportDialog.copyFailed }),
      ).toBeTruthy(),
    );
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
      adjustments: {
        ...useEditorStore.getState().adjustments,
        contrast: 45,
        saturation: -30,
      },
      filters: useEditorStore
        .getState()
        .filters.map((f) =>
          f.type === "grayscale"
            ? { ...f, enabled: true }
            : f.type === "sharpen"
              ? { ...f, enabled: false, params: { amount: 60 } }
              : f.type === "vignette"
                ? { ...f, enabled: true, params: { ...f.params, amount: 90, feather: 12 } }
                : f,
        ),
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
        filters: [
          { type: "blur", enabled: true, params: { radius: 8 } },
          { type: "vignette", enabled: true, params: { amount: 75 } },
        ],
      }),
      "good.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const state = useEditorStore.getState();
    expect(state.activeLayerId).toBe("kept-layer");
    expect(state.adjustments.brightness).toBe(25);
    expect(state.adjustments.contrast).toBe(0);
    expect(state.adjustments.saturation).toBe(0);
    expect(state.filters.length).toBeGreaterThan(1);
    expect(state.filters.find((f) => f.type === "blur")).toEqual({
      type: "blur",
      enabled: true,
      params: { radius: 8 },
    });
    expect(state.filters.find((f) => f.type === "grayscale")).toEqual({
      type: "grayscale",
      enabled: false,
      params: {},
    });
    expect(state.filters.find((f) => f.type === "sharpen")).toEqual({
      type: "sharpen",
      enabled: false,
      params: { amount: 0 },
    });
    expect(state.filters.find((f) => f.type === "vignette")).toEqual({
      type: "vignette",
      enabled: true,
      params: { amount: 75, midpoint: 50, roundness: 0, feather: 50 },
    });
  });

  it("resets adjustments, filters, and layers to clean defaults when loading a project that omits them (#2676)", async () => {
    const onClose = vi.fn();
    useEditorStore.setState({
      isDirty: false,
      layers: [
        {
          id: "stale-layer-1",
          name: "Stale Layer",
          visible: false,
          locked: true,
          opacity: 0.4,
          blendMode: "multiply",
          thumbnail: "data:image/png;base64,AA==",
        },
        {
          id: "stale-layer-2",
          name: "Second Stale Layer",
          visible: true,
          locked: false,
          opacity: 0.9,
          blendMode: "screen",
          thumbnail: null,
        },
      ],
      activeLayerId: "stale-layer-2",
      adjustments: {
        brightness: 60,
        contrast: -40,
        hue: 120,
        saturation: 35,
        luminance: -15,
        exposure: 25,
        vibrance: -20,
        warmth: 50,
      },
      filters: useEditorStore
        .getState()
        .filters.map((f) =>
          f.type === "grayscale"
            ? { ...f, enabled: true }
            : f.type === "blur"
              ? { ...f, enabled: true, params: { radius: 24 } }
              : f,
        ),
    });
    render(<ExportDialog onClose={onClose} />);

    pickProjectFile(
      JSON.stringify({
        version: 1,
        canvasSize: { width: 800, height: 600 },
      }),
      "minimal.snapotter",
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const state = useEditorStore.getState();
    expect(state.canvasSize).toEqual({ width: 800, height: 600 });
    expect(state.layers).toEqual([
      {
        id: "layer-1",
        name: "Layer 1",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "source-over",
        thumbnail: null,
      },
    ]);
    expect(state.activeLayerId).toBe("layer-1");
    expect(state.adjustments).toEqual({
      brightness: 0,
      contrast: 0,
      hue: 0,
      saturation: 0,
      luminance: 0,
      exposure: 0,
      vibrance: 0,
      warmth: 0,
    });
    expect(state.filters.every((f) => f.enabled === false)).toBe(true);
    expect(state.filters.find((f) => f.type === "blur")?.params).toEqual({ radius: 0 });
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
      adjustments: {
        ...useEditorStore.getState().adjustments,
        contrast: 45,
        saturation: -30,
      },
      filters: useEditorStore
        .getState()
        .filters.map((f) =>
          f.type === "grayscale"
            ? { ...f, enabled: true }
            : f.type === "sharpen"
              ? { ...f, enabled: false, params: { amount: 60 } }
              : f.type === "vignette"
                ? { ...f, enabled: true, params: { ...f.params, amount: 90, feather: 12 } }
                : f,
        ),
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
          filters: [
            { type: "blur", enabled: true, params: { radius: 12 } },
            { type: "vignette", enabled: true, params: { amount: 75 } },
          ],
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
    expect(useEditorStore.getState().adjustments.saturation).toBe(0);
    expect(useEditorStore.getState().filters.length).toBeGreaterThan(1);
    expect(useEditorStore.getState().filters.find((f) => f.type === "blur")).toEqual({
      type: "blur",
      enabled: true,
      params: { radius: 12 },
    });
    expect(useEditorStore.getState().filters.find((f) => f.type === "grayscale")).toEqual({
      type: "grayscale",
      enabled: false,
      params: {},
    });
    expect(useEditorStore.getState().filters.find((f) => f.type === "sharpen")).toEqual({
      type: "sharpen",
      enabled: false,
      params: { amount: 0 },
    });
    expect(useEditorStore.getState().filters.find((f) => f.type === "vignette")).toEqual({
      type: "vignette",
      enabled: true,
      params: { amount: 75, midpoint: 50, roundness: 0, feather: 50 },
    });
    expect(state.unexpectedKey).toBeUndefined();
  });

  it("resets adjustments, filters, and layers to clean defaults when restoring an autosave that omits them (#3161)", () => {
    useEditorStore.setState({
      isDirty: false,
      layers: [
        {
          id: "stale-layer-1",
          name: "Stale Layer",
          visible: false,
          locked: true,
          opacity: 0.4,
          blendMode: "multiply",
          thumbnail: "data:image/png;base64,AA==",
        },
        {
          id: "stale-layer-2",
          name: "Second Stale Layer",
          visible: true,
          locked: false,
          opacity: 0.9,
          blendMode: "screen",
          thumbnail: null,
        },
      ],
      activeLayerId: "stale-layer-2",
      adjustments: {
        brightness: 60,
        contrast: -40,
        hue: 120,
        saturation: 35,
        luminance: -15,
        exposure: 25,
        vibrance: -20,
        warmth: 50,
      },
      filters: useEditorStore
        .getState()
        .filters.map((f) =>
          f.type === "grayscale"
            ? { ...f, enabled: true }
            : f.type === "blur"
              ? { ...f, enabled: true, params: { radius: 24 } }
              : f,
        ),
    });

    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: 1700000000000,
        state: {
          canvasSize: { width: 800, height: 600 },
        } as unknown as Parameters<typeof restoreAutosave>[0]["state"],
      });
    });

    const state = useEditorStore.getState();
    expect(state.canvasSize).toEqual({ width: 800, height: 600 });
    expect(state.layers).toEqual([
      {
        id: "layer-1",
        name: "Layer 1",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "source-over",
        thumbnail: null,
      },
    ]);
    expect(state.activeLayerId).toBe("layer-1");
    expect(state.adjustments).toEqual({
      brightness: 0,
      contrast: 0,
      hue: 0,
      saturation: 0,
      luminance: 0,
      exposure: 0,
      vibrance: 0,
      warmth: 0,
    });
    expect(state.filters.every((f) => f.enabled === false)).toBe(true);
    expect(state.filters.find((f) => f.type === "blur")?.params).toEqual({ radius: 0 });
  });
});

function createFakeIndexedDb(options?: {
  quotaErrorOnPut?: boolean;
  errorOnOpen?: Error;
  errorOnGet?: Error;
}) {
  const stores = new Map<string, Map<string, unknown>>();
  return {
    stores,
    indexedDB: {
      open: (_name: string, _version?: number) => {
        const req: {
          result?: unknown;
          error?: unknown;
          onupgradeneeded?: () => void;
          onsuccess?: () => void;
          onerror?: () => void;
          onblocked?: () => void;
        } = {};
        queueMicrotask(() => {
          if (options?.errorOnOpen) {
            req.error = options.errorOnOpen;
            req.onerror?.();
            return;
          }
          const db = {
            objectStoreNames: {
              contains: (name: string) => stores.has(name),
            },
            createObjectStore: (name: string) => {
              if (!stores.has(name)) stores.set(name, new Map());
              return {};
            },
            transaction: (storeName: string, _mode?: string) => {
              let backing = stores.get(storeName);
              if (!backing) {
                backing = new Map();
                stores.set(storeName, backing);
              }
              let aborted = false;
              const tx: {
                error?: unknown;
                oncomplete?: () => void;
                onerror?: () => void;
                onabort?: () => void;
                objectStore: (name: string) => unknown;
              } = {
                objectStore: () => ({
                  clear: () => {
                    backing.clear();
                    return {};
                  },
                  put: (value: unknown, key: string) => {
                    if (options?.quotaErrorOnPut) {
                      aborted = true;
                      tx.error = new DOMException("Quota exceeded", "QuotaExceededError");
                      queueMicrotask(() => tx.onabort?.());
                      return {};
                    }
                    backing.set(key, value);
                    return {};
                  },
                  get: (key: string) => {
                    const getReq: {
                      result?: unknown;
                      error?: unknown;
                      onsuccess?: () => void;
                      onerror?: () => void;
                    } = {};
                    queueMicrotask(() => {
                      if (options?.errorOnGet) {
                        getReq.error = options.errorOnGet;
                        getReq.onerror?.();
                        return;
                      }
                      getReq.result = backing.get(key);
                      getReq.onsuccess?.();
                    });
                    return getReq;
                  },
                }),
              };
              queueMicrotask(() => {
                queueMicrotask(() => {
                  if (!aborted) tx.oncomplete?.();
                });
              });
              return tx;
            },
            close: () => {},
          };
          req.result = db;
          req.onupgradeneeded?.();
          req.onsuccess?.();
        });
        return req;
      },
    },
  };
}

function RecoveryHarness() {
  const { recoveryData, dismissRecovery, restoreRecovery } = useAutosave();
  if (!recoveryData) return <div data-testid="no-recovery" />;
  return (
    <AutosaveRecoveryBanner
      data={recoveryData}
      onRestore={restoreRecovery}
      onDiscard={dismissRecovery}
    />
  );
}

describe("Autosave IndexedDB storage and quota failure handling (#2173)", () => {
  it("stores the source bitmap and image objects as Blobs in IndexedDB when localStorage rejects large payloads, and restores across reload", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        // Simulate localStorage throwing QuotaExceededError on large base64 payloads
        if (v.length > 4096) {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        }
        lsStore.set(k, v);
      },
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (obj) => `blob:http://localhost:1351/restored-${(obj as Blob).size}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const largeBase64 = Buffer.alloc(6000, 0x42).toString("base64");
    const rebakedPngDataUrl = `data:image/png;base64,${largeBase64}`;
    const strokePngDataUrl = `data:image/png;base64,${Buffer.alloc(3500, 0x24).toString("base64")}`;

    useEditorStore.setState({
      canvasSize: { width: 3000, height: 4000 },
      sourceImageUrl: rebakedPngDataUrl,
      sourceImageSize: { width: 3000, height: 4000 },
      objects: [
        {
          id: "stroke-1",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 3000,
            height: 4000,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: strokePngDataUrl,
          },
        },
      ],
      lastAutoSave: null,
    });

    await (saveEditorState as (opts?: { manual?: boolean }) => Promise<unknown>)({ manual: true });

    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(useEditorStore.getState().lastAutoSave).toEqual(expect.any(Number));
    const savedJson = lsStore.get("snapotter-editor-autosave");
    expect(savedJson).toBeDefined();
    expect(savedJson?.length).toBeLessThan(4096);

    // Simulate reload: clear editor store and mount RecoveryHarness
    useEditorStore.setState({
      canvasSize: { width: 800, height: 600 },
      sourceImageUrl: null,
      sourceImageSize: null,
      objects: [],
    });

    const { unmount } = render(<RecoveryHarness />);

    const restoreBtn = await screen.findByRole("button", {
      name: en.editor.ui.autosaveRecovery.restore,
    });
    fireEvent.click(restoreBtn);

    expect(useEditorStore.getState().canvasSize).toEqual({ width: 3000, height: 4000 });
    expect(useEditorStore.getState().sourceImageUrl).toBe(
      "blob:http://localhost:1351/restored-6000",
    );
    expect(useEditorStore.getState().objects).toHaveLength(1);
    expect(useEditorStore.getState().objects[0]?.attrs.src).toBe(
      "blob:http://localhost:1351/restored-3500",
    );
    expect(lsStore.get("snapotter-editor-autosave")).toBeUndefined();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Unmounting after Restore must not revoke the blob URLs now owned by the editor store
    unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("reports QuotaExceededError with captureHandledError and shows a toast on manual save failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeIdb = createFakeIndexedDb({ quotaErrorOnPut: true });
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
      lastAutoSave: null,
    });

    await (
      saveEditorState as (opts?: { manual?: boolean; errorMessage?: string }) => Promise<unknown>
    )({
      manual: true,
      errorMessage: "Custom save failed toast",
    });

    expect(toastError).toHaveBeenCalledWith("Custom save failed toast");
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Editor autosave exceeded storage quota",
      }),
      expect.objectContaining({
        error_class: "operational",
        tool_id: "editor-autosave",
      }),
    );
    expect(useEditorStore.getState().lastAutoSave).toBeNull();
  });

  it("reports QuotaExceededError once without toasting on background autosaves", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearAutosave();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    });
    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await saveEditorState();
    await saveEditorState();

    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Editor autosave exceeded storage quota",
      }),
      expect.objectContaining({
        error_class: "operational",
        tool_id: "editor-autosave",
      }),
    );
  });

  it("clears broken autosave and hides recovery banner when IndexedDB blob is missing on reload", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await saveEditorState();
    expect(lsStore.get("snapotter-editor-autosave")).toBeDefined();

    // Simulate IndexedDB blob store being wiped while localStorage remained
    fakeIdb.stores.clear();

    render(<RecoveryHarness />);

    await waitFor(() => {
      expect(lsStore.get("snapotter-editor-autosave")).toBeUndefined();
    });
    expect(screen.getByTestId("no-recovery")).toBeInTheDocument();
  });

  it("revokes hydrated object URLs and clears IndexedDB and localStorage when Discard is clicked", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (obj) => `blob:http://localhost:1351/discard-${(obj as Blob).size}`,
    );

    useEditorStore.setState({
      sourceImageUrl:
        "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
      sourceImageSize: { width: 100, height: 100 },
    });

    await saveEditorState();
    expect(fakeIdb.stores.get("blobs")?.size).toBe(1);

    render(<RecoveryHarness />);

    const discardBtn = await screen.findByRole("button", {
      name: en.editor.ui.autosaveRecovery.discard,
    });
    fireEvent.click(discardBtn);

    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:1351/discard-41");
    expect(lsStore.get("snapotter-editor-autosave")).toBeUndefined();
    await waitFor(() => {
      expect(fakeIdb.stores.get("blobs")?.size ?? 0).toBe(0);
    });
    expect(screen.getByTestId("no-recovery")).toBeInTheDocument();
  });

  it("revokes hydrated object URLs without clearing storage when unmounted before Restore or Discard", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => "blob:http://localhost:1351/unmount-1",
    );

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await saveEditorState();

    const { unmount } = render(<RecoveryHarness />);
    await screen.findByRole("button", { name: en.editor.ui.autosaveRecovery.restore });

    unmount();

    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:1351/unmount-1");
    expect(lsStore.get("snapotter-editor-autosave")).toBeDefined();
  });

  it("falls back to inline localStorage when IndexedDB open fails with a non-quota error", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb({
      errorOnOpen: new DOMException("IndexedDB disabled", "SecurityError"),
    });
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await expect(saveEditorState({ manual: true })).resolves.toBe(true);
    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
    const saved = JSON.parse(lsStore.get("snapotter-editor-autosave") ?? "{}");
    expect(saved.state.sourceImageUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("clears newly written IndexedDB blobs and toasts when localStorage.setItem fails after IndexedDB write", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage disabled", "SecurityError");
      },
      removeItem: () => {},
      clear: () => {},
    });

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await expect(saveEditorState({ manual: true })).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith(en.editor.ui.autosaveRecovery.saveFailed);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Editor autosave storage failed" }),
      expect.objectContaining({ error_class: "operational", tool_id: "editor-autosave" }),
    );
    await waitFor(() => {
      expect(fakeIdb.stores.get("blobs")?.size ?? 0).toBe(0);
    });
  });

  it("surfaces the default saveFailed toast and reports serialization errors on manual save", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/broken",
      sourceImageSize: { width: 100, height: 100 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );

    await expect(saveEditorState({ manual: true })).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith(en.editor.ui.autosaveRecovery.saveFailed);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Editor autosave serialization failed" }),
      expect.objectContaining({ error_class: "operational", tool_id: "editor-autosave" }),
    );
  });

  it("hydrates IndexedDB blobs asynchronously when restoreAutosave is called directly with unhydrated state", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (obj) => `blob:http://localhost:1351/direct-${(obj as Blob).size}`,
    );

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
      objects: [
        {
          id: "img-obj-1",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: "data:image/png;base64,AAAA",
          },
        },
      ],
    });

    await saveEditorState();
    const unhydrated = loadAutosaveState();
    if (!unhydrated) throw new Error("Expected unhydrated autosave state");
    expect(unhydrated.state.sourceImageUrl).toBe("idb://snapotter-editor-autosave/source");
    expect(unhydrated.state.objects[0]?.attrs.src).toBe(
      "idb://snapotter-editor-autosave/object/img-obj-1",
    );

    act(() => {
      restoreAutosave(unhydrated);
    });
    // Never puts raw idb:// URIs into sourceImageUrl or objects while hydrating
    expect(useEditorStore.getState().sourceImageUrl).toBeNull();
    expect(useEditorStore.getState().objects).toEqual([]);

    await waitFor(() => {
      expect(useEditorStore.getState().sourceImageUrl).toBe("blob:http://localhost:1351/direct-8");
    });
    expect(useEditorStore.getState().objects).toHaveLength(1);
    expect(useEditorStore.getState().objects[0]?.attrs.src).toBe(
      "blob:http://localhost:1351/direct-3",
    );
  });

  it("saves blob: URLs for sourceImageUrl and image objects into IndexedDB and clears IndexedDB when saving a document with no blobs", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        blob: async () =>
          new Blob([url.includes("obj") ? "obj-bytes" : "source-bytes-123"], {
            type: "image/png",
          }),
      })),
    );

    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/source-1",
      sourceImageSize: { width: 200, height: 150 },
      objects: [
        {
          id: "blob-obj",
          type: "image",
          layerId: "layer-1",
          attrs: {
            x: 0,
            y: 0,
            width: 20,
            height: 20,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            src: "blob:http://localhost:1351/obj-1",
          },
        },
      ],
    });

    await expect(saveEditorState()).resolves.toBe(true);
    expect(fakeIdb.stores.get("blobs")?.size).toBe(2);

    // Saving a document with no image blobs clears the stale IndexedDB blobs
    useEditorStore.setState({
      sourceImageUrl: null,
      sourceImageSize: null,
      objects: [],
    });
    await expect(saveEditorState()).resolves.toBe(true);
    await waitFor(() => {
      expect(fakeIdb.stores.get("blobs")?.size ?? 0).toBe(0);
    });
  });

  it("resets autosaveFailureReported after a successful save and preserves manual toast when superseded by a background save", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearAutosave();
    let shouldFail = true;
    const lsStore = new Map<string, string>();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (shouldFail) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        lsStore.set(k, v);
      },
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    // First background failure reports once
    await saveEditorState();
    expect(captureHandledError).toHaveBeenCalledTimes(1);

    // Subsequent successful save resets the deduplication flag
    shouldFail = false;
    await expect(saveEditorState()).resolves.toBe(true);

    // Next background failure reports again
    shouldFail = true;
    await saveEditorState();
    expect(captureHandledError).toHaveBeenCalledTimes(2);

    // Start a manual save that is superseded by a background save before settling
    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/slow-manual",
      sourceImageSize: { width: 100, height: 100 },
    });
    let resolveSlowFetch: (value: unknown) => void = () => {};
    let slowFetchCaptured = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            if (!slowFetchCaptured) {
              slowFetchCaptured = true;
              resolveSlowFetch = resolve;
            } else {
              resolve({
                ok: true,
                status: 200,
                blob: async () => new Blob(["fast"], { type: "image/png" }),
              });
            }
          }),
      ),
    );

    const manualPromise = saveEditorState({ manual: true, errorMessage: "Manual save failed" });
    const backgroundPromise = saveEditorState();
    resolveSlowFetch({
      ok: true,
      status: 200,
      blob: async () => new Blob(["slow"], { type: "image/png" }),
    });

    await expect(manualPromise).resolves.toBe(false);
    await expect(backgroundPromise).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith("Manual save failed");
  });

  it("aborts an in-flight saveEditorState when clearAutosave is called before it commits", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);

    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    useEditorStore.setState({
      sourceImageUrl: "blob:http://localhost:1351/in-flight",
      sourceImageSize: { width: 100, height: 100 },
    });

    const savePromise = saveEditorState();
    clearAutosave();

    resolveFetch({
      ok: true,
      status: 200,
      blob: async () => new Blob(["late-bytes"], { type: "image/png" }),
    });

    await expect(savePromise).resolves.toBe(false);
    expect(lsStore.get("snapotter-editor-autosave")).toBeUndefined();
    expect(fakeIdb.stores.get("blobs")?.size ?? 0).toBe(0);
  });

  it("dismisses a stale recovery banner and revokes its URLs when a new save succeeds", async () => {
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => lsStore.set(k, v),
      removeItem: (k: string) => lsStore.delete(k),
      clear: () => lsStore.clear(),
    });
    const fakeIdb = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fakeIdb.indexedDB);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => "blob:http://localhost:1351/stale-banner",
    );

    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 100, height: 100 },
    });

    await saveEditorState();

    render(<RecoveryHarness />);
    await screen.findByRole("button", { name: en.editor.ui.autosaveRecovery.restore });

    // A new save overwrites the autosave slot with a newer timestamp
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await saveEditorState();
    });

    await waitFor(() => {
      expect(screen.getByTestId("no-recovery")).toBeInTheDocument();
    });
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:1351/stale-banner");
    expect(lsStore.get("snapotter-editor-autosave")).toBeDefined();
  });
});
