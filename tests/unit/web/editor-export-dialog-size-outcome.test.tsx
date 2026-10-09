// @vitest-environment jsdom

/**
 * #2174: three gaps in the editor's export dialog. The height box fed nothing but
 * itself with the aspect lock off (a 4000x3000 document exported as 1000x750 when
 * 1000x300 was typed); editor_exported fired before the outcome was known, so every
 * failed export counted as one; and the full-size estimate re-captured the document
 * on every keystroke, which is how a half-typed width reached the canvas in #2140.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const copyImageToClipboard = vi.hoisted(() => vi.fn(async () => true));

// jsdom has no 2D canvas. Every canvas the dialog touches (the capture and the one it
// builds the file on) is a fake that records its size and what was drawn into it.
const fake = vi.hoisted(() => {
  type FakeCanvas = {
    width: number;
    height: number;
    drawn: unknown[][];
    fills: string[];
    getContext: () => unknown;
    toDataURL: () => string;
    toBlob: (cb: (blob: Blob | null) => void) => void;
  };
  const state = {
    captures: [] as { width: number; height: number; ratio: number }[],
    made: [] as FakeCanvas[],
    giveContext: true,
    dataUrl: "data:image/png;base64,AA==",
    blob: null as Blob | null,
    throwOnEncode: null as Error | null,
  };
  function canvas(width: number, height: number): FakeCanvas {
    const c: FakeCanvas = {
      width,
      height,
      drawn: [],
      fills: [],
      getContext: () => {
        if (!state.giveContext) return null;
        const ctx = {
          fillStyle: "",
          fillRect: () => c.fills.push(ctx.fillStyle),
          drawImage: (...args: unknown[]) => c.drawn.push(args),
        };
        return ctx;
      },
      toDataURL: () => {
        if (state.throwOnEncode) throw state.throwOnEncode;
        return state.dataUrl;
      },
      toBlob: (cb) => {
        if (state.throwOnEncode) throw state.throwOnEncode;
        cb(state.blob);
      },
    };
    return c;
  }
  return { state, canvas };
});

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
    fake.state.captures.push({ width: w, height: h, ratio });
    // Konva's drawImage of a layer canvas with a 0 px side throws InvalidStateError.
    if (Math.floor(w * ratio) < 1 || Math.floor(h * ratio) < 1) {
      throw new DOMException("The object is in an invalid state.", "InvalidStateError");
    }
    return fake.canvas(Math.floor(w * ratio), Math.floor(h * ratio));
  },
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { track } from "@/lib/analytics";
import { useEditorStore } from "@/stores/editor-store";

// Mirrors ESTIMATE_DEBOUNCE_MS in export-dialog.tsx. Kept literal so the file still
// loads (and fails on behaviour) against code that has no debounce at all.
const ESTIMATE_DEBOUNCE_MS = 300;

const markClean = vi.fn();
const TOO_LARGE = en.editor.ui.exportDialog.tooLarge;
const TAINTED = en.editor.ui.captureFailure.crossOriginBlocked;

beforeEach(() => {
  markClean.mockReset();
  toastError.mockReset();
  copyImageToClipboard.mockClear();
  vi.mocked(track).mockClear();
  fake.state.captures = [];
  fake.state.made = [];
  fake.state.giveContext = true;
  fake.state.dataUrl = "data:image/png;base64,AA==";
  fake.state.blob = new Blob(["x"]);
  fake.state.throwOnEncode = null;
  useEditorStore.setState({ markClean, isDirty: true, canvasSize: { width: 4000, height: 3000 } });
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    const c = fake.canvas(0, 0);
    fake.state.made.push(c);
    return c as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
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

const clickExport = () =>
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.exportDialog.exportButton }));
const clickCopy = () => fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
const unlock = () =>
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.unlockAspectRatio }));
const boxes = () => screen.getAllByRole("spinbutton") as HTMLInputElement[];
const type = (box: HTMLInputElement, value: string) => fireEvent.change(box, { target: { value } });

// The canvases the file was built on, as [width, height].
const outputSizes = () => fake.state.made.map((c) => [c.width, c.height]);
const taintedError = () => new DOMException("tainted", "SecurityError");

describe("the height box is honoured with the aspect lock off (#2174)", () => {
  it("exports at the typed width and height", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    const [width, height] = boxes();
    type(width, "1000");
    type(height, "300");
    expect(width).toHaveValue(1000);
    expect(height).toHaveValue(300);

    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(outputSizes()).toContainEqual([1000, 300]);
    for (const size of outputSizes()) expect(size).toEqual([1000, 300]);
    // The document is captured at the larger of the two ratios (1000/4000, not
    // 300/3000), so neither axis is upsampled, then drawn into the requested size.
    expect(fake.state.captures.at(-1)?.ratio).toBeCloseTo(0.25);
    const out = fake.state.made.find((c) => c.drawn.length > 0);
    expect(out?.drawn[0].slice(1)).toEqual([0, 0, 1000, 300]);
  });

  it("copies at the typed width and height too", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    const [width, height] = boxes();
    type(width, "1000");
    type(height, "300");

    clickCopy();
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(outputSizes()).toContainEqual([1000, 300]);
  });

  it("still follows the lock when it is on", () => {
    render(<ExportDialog onClose={() => {}} />);
    const [width, height] = boxes();
    type(width, "1000");
    expect(height).toHaveValue(750);
    type(height, "600");
    expect(width).toHaveValue(800);
  });

  it("never lets the locked dimension round down to 0 px", async () => {
    useEditorStore.setState({ canvasSize: { width: 800, height: 200 } });
    render(<ExportDialog onClose={() => {}} />);
    const [width, height] = boxes();
    type(width, "1");
    expect(height).toHaveValue(1);

    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    expect(outputSizes()).toContainEqual([1, 1]);
    for (const c of fake.state.captures) {
      expect(Math.floor(800 * c.ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(200 * c.ratio)).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the capture itself when it already is the requested size", async () => {
    useEditorStore.setState({ canvasSize: { width: 1920, height: 1080 } });
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    // A transparent PNG at the document's own size needs no second canvas.
    expect(fake.state.made.filter((c) => c.drawn.length > 0)).toHaveLength(0);
  });

  it("builds the opaque JPEG on white at the requested size", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "JPEG" }));
    unlock();
    const [width, height] = boxes();
    type(width, "1000");
    type(height, "300");
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    const out = fake.state.made.find((c) => c.drawn.length > 0);
    expect([out?.width, out?.height]).toEqual([1000, 300]);
    expect(out?.fills).toEqual(["#ffffff"]);
  });
});

describe("editor_exported carries the outcome (#2174)", () => {
  const exported = () =>
    vi.mocked(track).mock.calls.filter(([event]) => event === "editor_exported");

  it("counts a finished export once, after the file is made", async () => {
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(exported()).toHaveLength(1));
    expect(exported()[0][1]).toEqual({ output_format: "png", outcome: "success" });
  });

  it("counts a canvas the browser could not encode as a failed export", async () => {
    fake.state.dataUrl = "data:,";
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    await waitFor(() => expect(exported()).toHaveLength(1));
    expect(exported()[0][1]).toEqual({
      output_format: "png",
      outcome: "failed",
      failure_reason: "no-context",
    });
    expect(markClean).not.toHaveBeenCalled();
  });

  it("counts a tainted canvas as a failed export", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fake.state.throwOnEncode = taintedError();
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TAINTED, expect.anything()));
    await waitFor(() => expect(exported()).toHaveLength(1));
    expect(exported()[0][1]).toMatchObject({ outcome: "failed", failure_reason: "tainted" });
  });

  it("counts a server conversion the API refused as a failed export", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, blob: async () => new Blob(["x"]) })),
    );
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await waitFor(() => expect(exported()).toHaveLength(1));
    expect(exported()[0][1]).toEqual({
      output_format: "avif",
      outcome: "failed",
      failure_reason: "server-convert",
    });
    expect(markClean).not.toHaveBeenCalled();
  });

  it("counts a finished server conversion as a success", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(exported()).toHaveLength(1));
    expect(exported()[0][1]).toEqual({ output_format: "avif", outcome: "success" });
  });

  it("does not count the click while the server is still converting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<ExportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "AVIF" }));
    clickExport();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(exported()).toHaveLength(0);
  });
});

describe("the size estimate waits for typing to stop (#2174)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The 200 px thumbnail is cheap and stays immediate; the full-size capture is the
  // expensive one and is what used to run on every keystroke.
  const fullCaptures = () => fake.state.captures.filter((c) => c.ratio > 200 / 3000);

  it("shows the first estimate with the dialog, then captures once after the last keystroke", () => {
    render(<ExportDialog onClose={() => {}} />);
    // On open: the thumbnail and one full-size estimate, nothing pending.
    expect(fake.state.captures).toHaveLength(2);
    expect(fullCaptures()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);

    const [width] = boxes();
    type(width, "1");
    type(width, "12");
    type(width, "1200");
    expect(fullCaptures()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(fullCaptures()).toHaveLength(2);
    expect(fullCaptures()[1].ratio).toBeCloseTo(1200 / 4000);
  });

  it("restarts the wait on every change", () => {
    render(<ExportDialog onClose={() => {}} />);
    const [width] = boxes();
    type(width, "2000");
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS - 1);
    });
    type(width, "1000");
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS - 1);
    });
    expect(fullCaptures()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fullCaptures()).toHaveLength(2);
    expect(fullCaptures()[1].ratio).toBeCloseTo(0.25);
  });
});
