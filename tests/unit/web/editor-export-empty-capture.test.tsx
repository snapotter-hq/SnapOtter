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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { ExportDialog, saveEditorState } from "@/components/editor/common/export-dialog";
import { captureHandledError } from "@/lib/analytics";
import { useEditorStore } from "@/stores/editor-store";

const markClean = vi.fn();
const TOO_LARGE = en.editor.ui.exportDialog.tooLarge;
const TAINTED = en.editor.ui.captureFailure.crossOriginBlocked;

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
  useEditorStore.setState({
    markClean,
    isDirty: true,
    canvasSize: { width: 1920, height: 1080 },
    sourceImageUrl: null,
    sourceImageSize: null,
    objects: [],
  });
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas"
      ? (fakeCanvas(0, 0) as unknown as HTMLCanvasElement)
      : realCreate(tag)) as typeof document.createElement);
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
