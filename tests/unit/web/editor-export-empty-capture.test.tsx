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
}));

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyImageToClipboard };
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
    return {
      width: 10,
      height: 10,
      toDataURL: () => {
        if (capture.throwOnEncode) throw capture.throwOnEncode;
        return capture.dataUrl;
      },
      toBlob: (cb: (blob: Blob | null) => void) => {
        if (capture.throwOnEncode) throw capture.throwOnEncode;
        cb(capture.blob);
      },
    };
  },
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { useEditorStore } from "@/stores/editor-store";

const markClean = vi.fn();
const TOO_LARGE = en.editor.ui.exportDialog.tooLarge;
const TAINTED = en.editor.ui.captureFailure.crossOriginBlocked;

beforeEach(() => {
  markClean.mockReset();
  toastError.mockReset();
  copyImageToClipboard.mockClear();
  capture.dataUrl = "data:image/png;base64,AA==";
  capture.blob = new Blob(["x"]);
  capture.throwOnEncode = null;
  capture.ratios = [];
  useEditorStore.setState({ markClean, isDirty: true, canvasSize: { width: 1920, height: 1080 } });
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

  it("does not swallow an error that is not a capture failure", () => {
    render(<ExportDialog onClose={() => {}} />);
    capture.throwOnEncode = new TypeError("a real bug");
    // React rethrows an event-handler error asynchronously; the test only needs
    // the guard not to turn it into a toast.
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", swallow);
    try {
      clickExport();
    } finally {
      window.removeEventListener("error", swallow);
    }
    expect(toastError).not.toHaveBeenCalled();
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
    for (const ratio of capture.ratios) {
      expect(Math.floor(800 * ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(200 * ratio)).toBeGreaterThanOrEqual(1);
    }
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
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
  // jsdom's canvas has no 2D context, which is the same branch a browser at its limit takes.
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
