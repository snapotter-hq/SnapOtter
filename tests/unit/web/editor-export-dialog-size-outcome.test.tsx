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
    // Konva sizes the capture by truncating w * ratio, and drawing a layer canvas
    // with a 0 px side throws InvalidStateError.
    if (Math.floor(w * ratio) < 1 || Math.floor(h * ratio) < 1) {
      throw new DOMException("The object is in an invalid state.", "InvalidStateError");
    }
    return fake.canvas(Math.floor(w * ratio), Math.floor(h * ratio), fake.state.deadCaptures);
  },
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
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

// The editor_exported events sent so far. Each report reaches track() through a
// dynamic import of the analytics module; once those settle nothing else is on its
// way, so "one event" means one.
async function exported() {
  await vi.dynamicImportSettled();
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

  it("encodes the capture itself when it already is the requested size", async () => {
    useEditorStore.setState({ canvasSize: { width: 1920, height: 1080 } });
    render(<ExportDialog onClose={() => {}} />);

    const click = during(clickExport);
    // A transparent PNG at the document's own size needs no second canvas.
    expect(click.made).toEqual([]);
    expect(click.encoded.map(size)).toEqual([[1920, 1080]]);
    await waitFor(() => expect(markClean).toHaveBeenCalledTimes(1));
  });
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

  it("counts an error that is not a capture failure as a failed export and still throws it", async () => {
    render(<ExportDialog onClose={() => {}} />);
    fake.state.throwOnEncode = new TypeError("a real bug");
    // React hands an event-handler error to window's error event; keep it from
    // failing the run and record that it surfaced.
    const surfaced: unknown[] = [];
    const swallow = (event: ErrorEvent) => {
      surfaced.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", swallow);
    try {
      clickExport();
    } finally {
      window.removeEventListener("error", swallow);
    }
    expect(surfaced).toEqual([expect.any(TypeError)]);
    expect(await exported()).toEqual([{ output_format: "png", status: "failed", reason: "bug" }]);
    expect(toastError).not.toHaveBeenCalled();
    expect(markClean).not.toHaveBeenCalled();
  });

  it("counts a server conversion the API refused as a failed export", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, blob: async () => new Blob(["x"]) })),
    );
    render(<ExportDialog onClose={() => {}} />);
    pickFormat("AVIF");
    clickExport();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(await exported()).toEqual([
      { output_format: "avif", status: "failed", reason: "server-convert" },
    ]);
    expect(markClean).not.toHaveBeenCalled();
  });

  // The convert route answers 202 with no file once a job outlives its sync wait,
  // and the dialog doesn't follow the job yet (#2171). That gets its own reason so
  // a slow server isn't counted as a refusal.
  it("counts a conversion the server answered before it finished as a failed export", async () => {
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
    await waitFor(() => expect(console.error).toHaveBeenCalled());
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

  it("reads the estimated size off the encoded file", () => {
    // 2048 bytes as base64: 2731 characters and one "=" of padding.
    fake.state.dataUrl = `data:image/png;base64,${"A".repeat(2731)}=`;
    render(<ExportDialog onClose={() => {}} />);
    expect(screen.getByText("~2 KB")).toBeInTheDocument();
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
