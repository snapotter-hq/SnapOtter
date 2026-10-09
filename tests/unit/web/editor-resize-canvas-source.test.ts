// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

import { useEditorStore } from "@/stores/editor-store";

type DrawCall = { canvas: { width: number; height: number }; args: number[] };

// jsdom has no canvas or image decoding, so stand both in and record where the
// source bitmap lands on the rebaked canvas. `ops` logs every 2D call in order, so a
// test can check that a background fill lands under the image and not over it.
function stubRaster(opts: { loadFails?: boolean; dataUrl?: string } = {}) {
  const draws: DrawCall[] = [];
  const ops: string[] = [];
  let decodes = 0;
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => {
        const ctx = {
          fillStyle: "#000000",
          fillRect: (...args: number[]) => ops.push(`fillRect(${args.join(",")}) ${ctx.fillStyle}`),
          clearRect: (...args: number[]) => ops.push(`clearRect(${args.join(",")})`),
          drawImage: (_img: unknown, ...args: number[]) => {
            draws.push({ canvas, args });
            ops.push(`drawImage(${args.join(",")})`);
          },
        };
        return ctx;
      },
      toDataURL: () => opts.dataUrl ?? "data:image/png;base64,REBAKED",
    };
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        decodes++;
        queueMicrotask(() => (opts.loadFails ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  return { draws, ops, decodes: () => decodes };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("resizeCanvas keeps the source image at its own scale (#2016)", () => {
  beforeEach(() => {
    useEditorStore.getState().loadImage("blob:test", 800, 600);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("centered growth draws the image at natural size, offset by half the delta", async () => {
    const { draws } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, "center");
    await flush();
    expect(draws).toHaveLength(1);
    expect(draws[0].canvas).toMatchObject({ width: 1000, height: 800 });
    expect(draws[0].args).toEqual([100, 100, 800, 600]);
    expect(useEditorStore.getState().sourceImageUrl).toBe("data:image/png;base64,REBAKED");
  });

  // 800x600 -> 1000x800 leaves 200 spare columns and 200 spare rows.
  it.each([
    ["top-left", 0, 0],
    ["top-center", 100, 0],
    ["top-right", 200, 0],
    ["center-left", 0, 100],
    ["center", 100, 100],
    ["center-right", 200, 100],
    ["bottom-left", 0, 200],
    ["bottom-center", 100, 200],
    ["bottom-right", 200, 200],
  ] as const)("%s anchor places the image at (%i, %i)", async (anchor, x, y) => {
    const { draws } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, anchor);
    await flush();
    expect(draws[0].args).toEqual([x, y, 800, 600]);
  });

  it("rounds odd centering to whole pixels so the bitmap is not resampled", async () => {
    const { draws } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1001, 801, "center");
    await flush();
    expect(draws[0].args).toEqual([100, 100, 800, 600]);
  });

  it("shrinking crops instead of scaling", async () => {
    const { draws } = stubRaster();
    await useEditorStore.getState().resizeCanvas(400, 300, "top-left");
    await flush();
    expect(draws[0].canvas).toMatchObject({ width: 400, height: 300 });
    expect(draws[0].args).toEqual([0, 0, 800, 600]);
  });

  it("leaves the source alone when there is no image", async () => {
    const { draws } = stubRaster();
    useEditorStore.setState({ sourceImageUrl: null });
    await useEditorStore.getState().resizeCanvas(1000, 800, "center");
    await flush();
    expect(draws).toHaveLength(0);
  });

  it("commits size, objects and bitmap together, so undo is one step", async () => {
    stubRaster();
    const before = useEditorStore.getState()._historyVersion;
    const pending = useEditorStore.getState().resizeCanvas(1000, 800, "center");
    // Nothing changes while the bitmap is still being built.
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 800, height: 600 });
    await pending;
    const s = useEditorStore.getState();
    expect(s.canvasSize).toEqual({ width: 1000, height: 800 });
    expect(s.sourceImageUrl).toBe("data:image/png;base64,REBAKED");
    expect(s._historyVersion).toBe(before + 1);
  });

  it("rejects and leaves the editor untouched when the source cannot reload", async () => {
    stubRaster({ loadFails: true });
    const before = useEditorStore.getState();
    await expect(before.resizeCanvas(1000, 800, "center")).rejects.toThrow();
    const after = useEditorStore.getState();
    expect(after.canvasSize).toEqual({ width: 800, height: 600 });
    expect(after.sourceImageUrl).toBe("blob:test");
    expect(after._historyVersion).toBe(before._historyVersion);
  });

  it("rejects when the browser hands back an empty data URL (canvas too large)", async () => {
    stubRaster({ dataUrl: "data:," });
    await expect(useEditorStore.getState().resizeCanvas(20000, 20000, "center")).rejects.toThrow();
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 800, height: 600 });
    expect(useEditorStore.getState().sourceImageUrl).toBe("blob:test");
  });

  it("drops the result if another image was loaded while it decoded", async () => {
    stubRaster();
    const pending = useEditorStore.getState().resizeCanvas(1000, 800, "center");
    useEditorStore.getState().loadImage("blob:other", 640, 480);
    await pending;
    const s = useEditorStore.getState();
    expect(s.sourceImageUrl).toBe("blob:other");
    expect(s.canvasSize).toEqual({ width: 640, height: 480 });
  });
});

// The Canvas Size dialog's Background colour used to be stored and never drawn: the
// added room stayed transparent whatever was picked.
describe("resizeCanvas paints the background fill into the added room (#2068)", () => {
  beforeEach(() => {
    useEditorStore.getState().loadImage("blob:test", 800, 600);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fills the whole canvas, clears the image's rectangle, then draws the image", async () => {
    const { ops } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, "center", "#112233");
    await flush();
    expect(ops).toEqual([
      "fillRect(0,0,1000,800) #112233",
      "clearRect(100,100,800,600)",
      "drawImage(100,100,800,600)",
    ]);
  });

  // The cleared rectangle has to follow the anchor exactly, or the fill would cover
  // part of the image on one side and leave a strip of the room transparent on the
  // other. Asymmetric anchors catch a swapped or reused offset.
  it.each([
    ["top-left", 0, 0],
    ["top-center", 100, 0],
    ["top-right", 200, 0],
    ["center-left", 0, 100],
    ["center-right", 200, 100],
    ["bottom-left", 0, 200],
    ["bottom-center", 100, 200],
    ["bottom-right", 200, 200],
  ] as const)("%s anchor clears and draws the image at (%i, %i)", async (anchor, x, y) => {
    const { ops } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, anchor, "#ABCDEF");
    await flush();
    expect(ops).toEqual([
      "fillRect(0,0,1000,800) #ABCDEF",
      `clearRect(${x},${y},800,600)`,
      `drawImage(${x},${y},800,600)`,
    ]);
  });

  it("leaves the added room transparent when no fill is given", async () => {
    const { ops } = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, "center");
    await flush();
    expect(ops).toEqual(["drawImage(100,100,800,600)"]);
  });

  // Only #rrggbb is accepted (what the dialog's picker can hold); anything else from
  // the free-text field is refused before anything is decoded, since an unparseable
  // fillStyle would paint the room black with no error.
  it.each(["red", "#fff", "112233", "#11223344", "#12345g", ""])(
    "rejects %j without decoding or touching the editor",
    async (fill) => {
      const { ops, decodes } = stubRaster();
      const before = useEditorStore.getState();
      await expect(before.resizeCanvas(1000, 800, "center", fill)).rejects.toThrow(/background/i);
      expect(decodes()).toBe(0);
      expect(ops).toEqual([]);
      const after = useEditorStore.getState();
      expect(after.canvasSize).toEqual({ width: 800, height: 600 });
      expect(after.sourceImageUrl).toBe("blob:test");
      expect(after._historyVersion).toBe(before._historyVersion);
    },
  );

  it("refuses a bad colour even when there is no image to paint", async () => {
    stubRaster();
    useEditorStore.setState({ sourceImageUrl: null });
    const before = useEditorStore.getState();
    await expect(before.resizeCanvas(1000, 800, "center", "red")).rejects.toThrow(/background/i);
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 800, height: 600 });
    expect(useEditorStore.getState()._historyVersion).toBe(before._historyVersion);
  });
});
