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
// builds the file on) is a fake that records its size, what was painted into it in
// order, and whether it was encoded into the file. A `dead` one is a canvas past the
// browser's limit: it reads back zeros whatever is written to it.
const fake = vi.hoisted(() => {
  type FakeCanvas = {
    width: number;
    height: number;
    dead: boolean;
    ops: string[];
    getContext: () => unknown;
    toDataURL: () => string;
    toBlob: (cb: (blob: Blob | null) => void) => void;
  };
  const state = {
    captures: [] as { width: number; height: number; ratio: number }[],
    made: [] as FakeCanvas[],
    encoded: [] as FakeCanvas[],
    giveContext: true,
    deadCaptures: false,
    dataUrl: "data:image/png;base64,AA==",
    blob: null as Blob | null,
    throwOnEncode: null as Error | null,
  };
  function canvas(width: number, height: number, dead = false): FakeCanvas {
    // The one pixel the dead-canvas probe writes and reads back.
    let pixel = new Uint8ClampedArray(4);
    const c: FakeCanvas = {
      width,
      height,
      dead,
      ops: [],
      getContext: () => {
        if (!state.giveContext) return null;
        const ctx = {
          fillStyle: "",
          fillRect: () => c.ops.push(`fill ${ctx.fillStyle}`),
          drawImage: (_source: unknown, ...box: number[]) => c.ops.push(`draw ${box.join(",")}`),
          createImageData: () => ({ data: new Uint8ClampedArray(4) }),
          getImageData: () => {
            if (state.throwOnEncode) throw state.throwOnEncode;
            return { data: c.dead ? new Uint8ClampedArray(4) : pixel.slice() };
          },
          putImageData: (image: { data: Uint8ClampedArray }) => {
            if (!c.dead) pixel = image.data.slice();
          },
        };
        return ctx;
      },
      toDataURL: () => {
        state.encoded.push(c);
        if (state.throwOnEncode) throw state.throwOnEncode;
        return state.dataUrl;
      },
      toBlob: (cb) => {
        state.encoded.push(c);
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
    // Konva sizes the capture by truncating w * ratio (and its internal bufferCanvas
    // by truncating ((w * ratio) / ratio) * ratio), and drawing a canvas with a 0 px
    // side throws InvalidStateError.
    if (
      Math.floor(w * ratio) < 1 ||
      Math.floor(h * ratio) < 1 ||
      Math.floor(((w * ratio) / ratio) * ratio) < 1 ||
      Math.floor(((h * ratio) / ratio) * ratio) < 1
    ) {
      throw new DOMException("The object is in an invalid state.", "InvalidStateError");
    }
    return fake.canvas(Math.floor(w * ratio), Math.floor(h * ratio), fake.state.deadCaptures);
  },
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { captureHandledError, track } from "@/lib/analytics";
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
  vi.mocked(captureHandledError).mockClear();
  vi.mocked(track).mockClear();
  fake.state.captures = [];
  fake.state.made = [];
  fake.state.encoded = [];
  fake.state.giveContext = true;
  fake.state.deadCaptures = false;
  fake.state.dataUrl = "data:image/png;base64,AA==";
  fake.state.blob = new Blob(["x"]);
  fake.state.throwOnEncode = null;
  editorStageRefHolder.current = {} as typeof editorStageRefHolder.current;
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
const pickFormat = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const unlock = () =>
  fireEvent.click(screen.getByRole("button", { name: en.editor.ui.unlockAspectRatio }));
const boxes = () => screen.getAllByRole("spinbutton") as HTMLInputElement[];
const type = (box: HTMLInputElement, value: string) => fireEvent.change(box, { target: { value } });
const typeSize = (width: string, height: string) => {
  const [w, h] = boxes();
  type(w, width);
  type(h, height);
};
const size = (c: { width: number; height: number }) => [c.width, c.height];
const taintedError = () => new DOMException("tainted", "SecurityError");

// What one click did. Export and Copy capture, build and encode inside the click
// handler, so this leaves out the size estimate, which runs on a timer.
function during(click: () => void) {
  const from = {
    captures: fake.state.captures.length,
    made: fake.state.made.length,
    encoded: fake.state.encoded.length,
  };
  click();
  return {
    captures: fake.state.captures.slice(from.captures),
    made: fake.state.made.slice(from.made),
    encoded: fake.state.encoded.slice(from.encoded),
  };
}

// The editor_exported events sent so far.
async function exported() {
  return vi
    .mocked(track)
    .mock.calls.filter(([event]) => event === "editor_exported")
    .map(([, properties]) => properties);
}

describe("the height box is honoured with the aspect lock off (#2174)", () => {
  it("exports at the typed width and height", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    typeSize("1000", "300");
    const [width, height] = boxes();
    expect(width).toHaveValue(1000);
    expect(height).toHaveValue(300);

    const click = during(clickExport);
    // Captured at the larger ratio (1000/4000, not 300/3000), so neither axis is
    // upsampled, then drawn into exactly the typed size. That canvas is the file.
    expect(click.captures.map((c) => c.ratio)).toEqual([0.25]);
    expect(click.encoded).toHaveLength(1);
    const file = click.encoded[0];
    expect(size(file)).toEqual([1000, 300]);
    expect(click.made).toHaveLength(1);
    expect(click.made[0]).toBe(file);
    // A transparent PNG gets no white fill.
    expect(file.ops).toEqual(["draw 0,0,1000,300"]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
  });

  it("captures at the height's ratio when the height is the larger one", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    typeSize("100", "3000");

    const click = during(clickExport);
    // 3000/3000 beats 100/4000; capturing at the width's ratio would stretch a 75 px
    // tall capture to 3000.
    expect(click.captures.map((c) => c.ratio)).toEqual([1]);
    expect(click.encoded.map(size)).toEqual([[100, 3000]]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
  });

  it("copies at the typed width and height too", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    typeSize("1000", "300");

    const click = during(clickCopy);
    expect(click.encoded.map(size)).toEqual([[1000, 300]]);
    expect(click.encoded[0].ops).toEqual(["draw 0,0,1000,300"]);
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
  });

  it("sends a server-converted format at the typed size", async () => {
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    unlock();
    typeSize("1000", "300");

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1000, 300]]);
    expect(click.encoded[0].ops).toEqual(["draw 0,0,1000,300"]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
  });

  it("builds the opaque JPEG on white at the requested size", async () => {
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("JPEG");
    unlock();
    typeSize("1000", "300");

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1000, 300]]);
    // White first, then the document over it.
    expect(click.encoded[0].ops).toEqual(["fill #ffffff", "draw 0,0,1000,300"]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
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

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1, 1]]);
    for (const c of click.captures) {
      expect(Math.floor(800 * c.ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(200 * c.ratio)).toBeGreaterThanOrEqual(1);
    }
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("never lets the locked width round down to 0 px on a tall document", async () => {
    useEditorStore.setState({ canvasSize: { width: 200, height: 800 } });
    render(<ExportDialog onClose={() => {}} />);
    const [width, height] = boxes();
    type(height, "1");
    expect(width).toHaveValue(1);

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1, 1]]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("encodes the capture itself when it already is the requested size", async () => {
    useEditorStore.setState({ canvasSize: { width: 1920, height: 1080 } });
    render(<ExportDialog onClose={() => {}} />);

    const click = during(clickExport);
    // A transparent PNG at the document's own size needs no second canvas.
    expect(click.made).toEqual([]);
    expect(click.encoded.map(size)).toEqual([[1920, 1080]]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
  });

  it("nudges the 1 px capture ratio when side * (1 / side) lands under 1 (#2338)", async () => {
    // 49 * (1 / 49) === 0.9999999999999999 in IEEE 754 float, which Konva truncates to 0 px.
    useEditorStore.setState({ canvasSize: { width: 800, height: 49 } });
    render(<ExportDialog onClose={() => {}} />);
    const [width, height] = boxes();
    type(width, "1");
    expect(height).toHaveValue(1);

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1, 1]]);
    for (const c of click.captures) {
      expect(Math.floor(800 * c.ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(49 * c.ratio)).toBeGreaterThanOrEqual(1);
    }
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));

    const copy = during(clickCopy);
    expect(copy.encoded.map(size)).toEqual([[1, 1]]);
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("nudges the 1 px capture ratio when the document width is the side where side * (1 / side) < 1 (#2338)", async () => {
    useEditorStore.setState({ canvasSize: { width: 49, height: 800 } });
    render(<ExportDialog onClose={() => {}} />);
    const [width, height] = boxes();
    type(height, "1");
    expect(width).toHaveValue(1);

    const click = during(clickExport);
    expect(click.encoded.map(size)).toEqual([[1, 1]]);
    for (const c of click.captures) {
      expect(Math.floor(49 * c.ratio)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(800 * c.ratio)).toBeGreaterThanOrEqual(1);
    }
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    ["wide", { width: 10000, height: 49 }],
    ["tall", { width: 49, height: 10000 }],
    ["wide bufferCanvas round-trip", { width: 10000, height: 93 }],
    ["tall bufferCanvas round-trip", { width: 93, height: 10000 }],
  ])(
    "renders the 200 px thumbnail on a %s document when the clamped short side truncates below 1 (#2338)",
    (_shape, docSize) => {
      useEditorStore.setState({ canvasSize: docSize });
      render(<ExportDialog onClose={() => {}} />);
      expect(screen.getByAltText(en.editor.ui.exportDialog.previewAlt)).toHaveAttribute(
        "src",
        fake.state.dataUrl,
      );
      for (const c of fake.state.captures) {
        expect(Math.floor(docSize.width * c.ratio)).toBeGreaterThanOrEqual(1);
        expect(Math.floor(docSize.height * c.ratio)).toBeGreaterThanOrEqual(1);
        expect(Math.floor(((docSize.width * c.ratio) / c.ratio) * c.ratio)).toBeGreaterThanOrEqual(
          1,
        );
        expect(Math.floor(((docSize.height * c.ratio) / c.ratio) * c.ratio)).toBeGreaterThanOrEqual(
          1,
        );
      }
    },
  );
});

describe("a capture the browser couldn't back (#2174)", () => {
  // With the lock off the capture is taken at the larger ratio, so it can be past the
  // browser's limit while the file is not. It draws nothing, and a file built from it
  // would download blank and count as an export.
  it("fails the export instead of downloading a blank file", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    typeSize("1000", "300");
    fake.state.deadCaptures = true;

    const click = during(clickExport);
    expect(click.encoded).toEqual([]);
    expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything());
    expect(await exported()).toEqual([
      { output_format: "png", status: "failed", reason: "no-context" },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });

  it("copies nothing and says so", async () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    typeSize("1000", "300");
    fake.state.deadCaptures = true;

    clickCopy();
    expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything());
    expect(
      await screen.findByRole("button", { name: en.editor.ui.exportDialog.copyFailed }),
    ).toBeInTheDocument();
    expect(copyImageToClipboard).not.toHaveBeenCalled();
  });
});

describe("editor_exported carries the outcome (#2174)", () => {
  it("counts a finished export once, after the file is made", async () => {
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(await exported()).toEqual([{ output_format: "png", status: "completed" }]);
  });

  it("counts a finished server conversion once, when the server answers", async () => {
    let answer: (response: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.startsWith("data:")
          ? Promise.resolve({ ok: true, blob: async () => new Blob(["x"]) })
          : new Promise((resolve) => {
              answer = resolve;
            }),
      ),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();
    // The click alone is not an export.
    expect(await exported()).toEqual([]);

    answer({ ok: true, json: async () => ({ downloadUrl: "/api/v1/download/job/export.avif" }) });
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(await exported()).toEqual([{ output_format: "avif", status: "completed" }]);
  });

  it("counts a canvas the browser could not encode as a failed export", async () => {
    fake.state.dataUrl = "data:,";
    render(<ExportDialog onClose={() => {}} />);
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TOO_LARGE, expect.anything()));
    expect(await exported()).toEqual([
      { output_format: "png", status: "failed", reason: "no-context" },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });

  it("counts a tainted canvas as a failed export", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fake.state.throwOnEncode = taintedError();
    clickExport();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(TAINTED, expect.anything()));
    expect(await exported()).toEqual([
      { output_format: "png", status: "failed", reason: "tainted" },
    ]);
  });

  it("counts an error that is not a capture failure as a failed export and reports it as a bug", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fake.state.throwOnEncode = new TypeError("a real bug");
    clickExport();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(await exported()).toEqual([{ output_format: "png", status: "failed", reason: "bug" }]);
    expect(markClean).not.toHaveBeenCalled();
  });

  it("counts a server conversion the API refused as a failed export, toasts, and reports to Sentry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, blob: async () => new Blob(["x"]) })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [reported, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(reported.message).toBe("Server-side export failed");
    expect((reported as { statusCode?: number }).statusCode).toBe(500);
    expect(tags).toEqual({ error_class: "operational", tool_id: "editor-export" });
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });

  // When EventSource is unavailable, a 202 cannot be followed and fails as server-pending.
  it("counts a conversion the server answered before it finished as a failed export when EventSource is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        blob: async () => new Blob(["x"]),
        json: async () => ({ jobId: "job-1", async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-pending" },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });

  it.each([
    [
      "no stage to capture",
      "PNG",
      "no-stage",
      () => {
        editorStageRefHolder.current = null;
      },
    ],
    [
      "a 2D context the browser won't give",
      "JPEG",
      "no-context",
      () => {
        fake.state.giveContext = false;
      },
    ],
    [
      "no blob for the server conversion",
      "AVIF",
      "no-context",
      () => {
        fake.state.blob = null;
      },
    ],
    [
      "a zero-byte file",
      "PNG",
      "no-context",
      () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => ({ ok: true, blob: async () => new Blob([]) })),
        );
      },
    ],
    [
      "a download that fails",
      "PNG",
      "download",
      () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new TypeError("Failed to fetch");
          }),
        );
      },
    ],
  ])("counts %s as a failed export", async (_case, format, reason, arrange) => {
    render(<ExportDialog onClose={() => {}} />);
    pickFormat(format);
    arrange();
    clickExport();
    await waitFor(() => expect(vi.mocked(track)).toHaveBeenCalled());
    expect(await exported()).toEqual([
      { output_format: format.toLowerCase(), status: "failed", reason },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });
});

describe("the size estimate waits for typing to stop (#2174)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The 200 px thumbnail of a 4000x3000 document is captured at 200/4000 and stays
  // immediate. Every other capture is the full-size estimate, which is debounced.
  const fullCaptures = () => fake.state.captures.filter((c) => c.ratio !== 200 / 4000);

  it("shows the first estimate with the dialog, then captures once after the last keystroke", () => {
    render(<ExportDialog onClose={() => {}} />);
    // On open: one full-size estimate straight away, and none queued behind it.
    expect(fullCaptures()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(fullCaptures()).toHaveLength(1);

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

  it("reads the estimated size off the encoded file and clears it when a later capture fails", () => {
    // 2048 bytes as base64: 2731 characters and one "=" of padding.
    fake.state.dataUrl = `data:image/png;base64,${"A".repeat(2731)}=`;
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText("~2 KB")).toBeInTheDocument();

    unlock();
    fake.state.deadCaptures = true;
    type(boxes()[1], "1500");
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(screen.queryByText("~2 KB")).not.toBeInTheDocument();
  });

  it("keeps the estimated size when a 1 px target hits a side where side * (1 / side) < 1 (#2338)", () => {
    fake.state.dataUrl = `data:image/png;base64,${"A".repeat(2731)}=`;
    useEditorStore.setState({ canvasSize: { width: 800, height: 49 } });
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText("~2 KB")).toBeInTheDocument();

    type(boxes()[0], "1");
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(screen.getByText("~2 KB")).toBeInTheDocument();
  });

  it("recomputes the debounced estimate when only the height changes with the lock off", () => {
    render(<ExportDialog onClose={() => {}} />);
    unlock();
    expect(fullCaptures()).toHaveLength(1);
    type(boxes()[1], "6000");
    expect(fullCaptures()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(fullCaptures()).toHaveLength(2);
    expect(fullCaptures()[1].ratio).toBeCloseTo(6000 / 3000);
  });

  it("drops a pending estimate when the dialog closes", () => {
    const { unmount } = render(<ExportDialog onClose={() => {}} />);
    type(boxes()[0], "1200");
    unmount();
    act(() => {
      vi.advanceTimersByTime(ESTIMATE_DEBOUNCE_MS);
    });
    expect(fullCaptures()).toHaveLength(1);
  });
});

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2;
  }
}

describe("server-converted formats follow 202 progress and surface errors (#2171)", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(["AVIF", "TIFF", "GIF", "JXL"] as const)(
    "follows a 202 %s export through SSE progress to completion and marks clean only when the download URL arrives",
    async (label) => {
      const ext = label.toLowerCase();
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: `job-${ext}`, async: true }),
      }));
      vi.stubGlobal("fetch", fetchSpy);

      render(<ExportDialog onClose={() => {}} />);
      pickFormat(label);
      clickExport();

      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
      const es = FakeEventSource.instances[0];
      expect(es.url).toBe(`/api/v1/jobs/job-${ext}/progress`);
      expect(markClean).not.toHaveBeenCalled();
      expect(await exported()).toEqual([]);

      // While the job is running on the server, the Export button is disabled so
      // clicking again cannot queue another conversion.
      const exportBtn = screen.getByRole("button", {
        name: en.editor.ui.exportDialog.exportButton,
      });
      expect(exportBtn).toBeDisabled();
      fireEvent.click(exportBtn);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      act(() => {
        es.onmessage?.({
          data: JSON.stringify({ type: "single", phase: "processing", percent: 50 }),
        });
      });
      expect(markClean).not.toHaveBeenCalled();

      act(() => {
        es.onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: `/api/v1/download/job-${ext}/export.${ext}` },
          }),
        });
      });

      await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
      expect(toastError).not.toHaveBeenCalled();
      expect(es.readyState).toBe(2);
      expect(exportBtn).toBeEnabled();
      expect(await exported()).toEqual([{ output_format: ext, status: "completed" }]);
    },
  );

  it("surfaces the worker's error message in a toast when a 202 export fails on the stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-fail", async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("JXL");
    clickExport();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "failed",
          error: "Encoder out of memory",
          details: "Try smaller dimensions",
        }),
      });
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Encoder out of memory: Try smaller dimensions"),
    );
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "jxl", status: "failed", reason: "server-convert" },
    ]);
    expect(
      screen.getByRole("button", { name: en.editor.ui.exportDialog.exportButton }),
    ).toBeEnabled();
  });

  it("falls back to translated processingFailedNoDetail when a 202 failed frame has no error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-bare-fail", async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("TIFF");
    clickExport();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", error: "   " }),
      });
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.errors.processingFailedNoDetail),
    );
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "tiff", status: "failed", reason: "server-convert" },
    ]);
  });

  it("reports a malformed completed SSE frame without a downloadUrl and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-malformed-sse", async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("GIF");
    clickExport();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "gif", status: "failed", reason: "server-convert" },
    ]);
  });

  it("toasts a timeout error and reports server-pending when a 202 progress stream stalls", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-stall", async: true }),
        })),
      );
      render(<ExportDialog onClose={() => {}} />);
      pickFormat("AVIF");
      clickExport();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeEventSource.instances).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(5 * 60_000);
      });

      expect(toastError).toHaveBeenCalledWith(en.errors.timeout);
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(markClean).not.toHaveBeenCalled();
      expect(await exported()).toEqual([
        { output_format: "avif", status: "failed", reason: "server-pending" },
      ]);
      expect(FakeEventSource.instances[0].readyState).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects the 202 progress stream when the tab becomes visible after a drop", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-vis", async: true }),
        })),
      );
      render(<ExportDialog onClose={() => {}} />);
      pickFormat("AVIF");
      clickExport();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeEventSource.instances).toHaveLength(1);
      FakeEventSource.instances[0].close();

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        vi.advanceTimersByTime(500);
      });

      expect(FakeEventSource.instances).toHaveLength(2);
      act(() => {
        FakeEventSource.instances[1].onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: "/api/v1/download/job-vis/export.avif" },
          }),
        });
      });

      expect(markClean).toHaveBeenCalledTimes(1);
      expect(await exported()).toEqual([{ output_format: "avif", status: "completed" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the 202 progress stream and clears its timers when the dialog unmounts", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-unmount", async: true }),
        })),
      );
      const { unmount } = render(<ExportDialog onClose={() => {}} />);
      pickFormat("AVIF");
      clickExport();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeEventSource.instances).toHaveLength(1);

      unmount();
      expect(FakeEventSource.instances[0].readyState).toBe(2);

      act(() => {
        vi.advanceTimersByTime(10 * 60_000);
      });
      expect(toastError).not.toHaveBeenCalled();
      expect(markClean).not.toHaveBeenCalled();
      expect(await exported()).toEqual([
        { output_format: "avif", status: "failed", reason: "server-pending" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      "a 400 error with details",
      400,
      { error: "Invalid settings", details: "quality: out of range" },
      "Invalid settings: quality: out of range",
    ],
    [
      "a 422 error with details alone",
      422,
      { details: "Image exceeds maximum allowed megapixels" },
      "Image exceeds maximum allowed megapixels",
    ],
    ["a 413 payload too large", 413, { error: "Payload Too Large" }, en.errors.fileTooLarge],
    [
      "an object error body",
      500,
      { error: { code: "INTERNAL" } },
      en.editor.ui.exportDialog.exportFailed,
    ],
  ])(
    "turns %s into a readable toast via parseApiError/failedAnswerMessage",
    async (_label, status, body, expectedMessage) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status,
          json: async () => body,
        })),
      );
      render(<ExportDialog onClose={() => {}} />);
      pickFormat("AVIF");
      clickExport();

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(expectedMessage));
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(markClean).not.toHaveBeenCalled();
      expect(await exported()).toEqual([
        { output_format: "avif", status: "failed", reason: "server-convert" },
      ]);
    },
  );

  it("toasts and reports to Sentry when the server-convert fetch rejects with a network error", async () => {
    const networkErr = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw networkErr;
      }),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [reported, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(reported.message).toBe("Server-side export request failed");
    expect(reported.cause).toBe(networkErr);
    expect(tags).toEqual({ error_class: "operational", tool_id: "editor-export" });
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
  });

  it("reports a malformed 200 response with no downloadUrl and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
  });

  it("reports a malformed 202 response with no jobId and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
  });

  it("reports a 200 response whose body is not valid JSON and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
  });

  it("aborts an in-flight convert fetch when the dialog unmounts before the server answers", async () => {
    let signal: AbortSignal | undefined;
    let rejectFetch: (err: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            rejectFetch = reject;
          }),
      ),
    );
    const { unmount } = render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    rejectFetch(new DOMException("Aborted", "AbortError"));
    await act(async () => {});

    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-pending" },
    ]);
  });

  it("forwards auth headers on the server-convert POST request", async () => {
    const store = new Map<string, string>([["snapotter-token", "tok-secret"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    let sentHeaders: Headers | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentHeaders = init?.headers as Headers | undefined;
        return {
          ok: true,
          status: 200,
          json: async () => ({ downloadUrl: "/api/v1/download/job/export.avif" }),
        };
      }),
    );

    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
    expect(sentHeaders?.get("Authorization")).toBe("Bearer tok-secret");
  });

  it("fails immediately as server-pending when the EventSource constructor throws", async () => {
    vi.stubGlobal(
      "EventSource",
      class {
        constructor() {
          throw new DOMException("Blocked by CSP", "SecurityError");
        }
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-csp", async: true }),
      })),
    );

    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(markClean).not.toHaveBeenCalled();
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-pending" },
    ]);
  });

  it("reports a bug and toasts exportFailed when download() throws on a sync 200 server conversion", async () => {
    markClean.mockImplementationOnce(() => {
      throw new Error("store subscriber broke");
    });
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.exportDialog.exportFailed),
    );
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(await exported()).toEqual([{ output_format: "avif", status: "failed", reason: "bug" }]);
  });

  it("reports a bug and toasts jobTrackingFailed when download() throws on a 202 completion frame", async () => {
    markClean.mockImplementationOnce(() => {
      throw new Error("store subscriber broke");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-track-err", async: true }),
      })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(() =>
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: "/api/v1/download/job-track-err/export.avif" },
        }),
      }),
    ).toThrow("store subscriber broke");

    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith(en.errors.jobTrackingFailed);
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(await exported()).toEqual([{ output_format: "avif", status: "failed", reason: "bug" }]);
  });

  it("reports a stream teardown failure and clears exporting when onFailed throws after download() throws on a 202 completion frame (#3010)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      markClean.mockImplementationOnce(() => {
        throw new Error("store subscriber broke");
      });
      toastError.mockImplementationOnce(() => {
        throw new Error("toast broke");
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-track-teardown-err", async: true }),
        })),
      );
      render(<ExportDialog onClose={() => {}} />);
      pickFormat("AVIF");
      clickExport();

      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
      await act(async () => {
        expect(() =>
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "complete",
              result: { downloadUrl: "/api/v1/download/job-track-teardown-err/export.avif" },
            }),
          }),
        ).toThrow("store subscriber broke");
      });

      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a stream handling error failed",
        expect.objectContaining({ message: "toast broke" }),
      );
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      const [reported, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect(reported.message).toBe("Ending an editor export after a stream handling error failed");
      expect(reported.cause).toMatchObject({ message: "toast broke" });
      expect(tags).toEqual({ error_class: "bug", tool_id: "editor-export" });
      expect(
        screen.getByRole("button", { name: en.editor.ui.exportDialog.exportButton }),
      ).not.toBeDisabled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
