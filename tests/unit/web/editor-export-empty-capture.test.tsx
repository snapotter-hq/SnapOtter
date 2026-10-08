// @vitest-environment jsdom

/**
 * Past the browser's canvas limit, Chromium and WebKit still hand out a canvas:
 * toDataURL() answers "data:," and toBlob() answers null. Export used to
 * download a 0-byte file and mark the document saved, which disarmed the
 * unsaved-work guard (#2140). A failed capture now says so and leaves the
 * document dirty.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => ({
  dataUrl: "data:image/png;base64,AA==",
  blob: new Blob(["x"]) as Blob | null,
}));

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock("@/components/editor/editor-canvas", () => ({ editorStageRefHolder: { current: {} } }));
vi.mock("@/components/editor/stage-capture", () => ({
  captureDocumentCanvas: () => ({
    width: 10,
    height: 10,
    toDataURL: () => capture.dataUrl,
    toBlob: (cb: (blob: Blob | null) => void) => cb(capture.blob),
  }),
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { useEditorStore } from "@/stores/editor-store";

const markClean = vi.fn();

beforeEach(() => {
  markClean.mockReset();
  toastError.mockReset();
  capture.dataUrl = "data:image/png;base64,AA==";
  capture.blob = new Blob(["x"]);
  useEditorStore.setState({ markClean, isDirty: true });
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

function clickExport() {
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.exportButton }));
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
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.captureFailure.noCanvasMemory),
    );
    expect(markClean).not.toHaveBeenCalled();
  });

  it("reports a zero-byte blob and leaves the document dirty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ blob: async () => new Blob([]) })),
    );
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.captureFailure.noCanvasMemory),
    );
    expect(markClean).not.toHaveBeenCalled();
  });

  it("reports a failed capture on the server-convert path too", async () => {
    capture.blob = null;
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.captureFailure.noCanvasMemory),
    );
    expect(markClean).not.toHaveBeenCalled();
  });
});
