// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

import { useEditorStore } from "@/stores/editor-store";

type DrawCall = { canvas: { width: number; height: number }; args: number[] };

// jsdom has no canvas or image decoding, so stand both in and record where the
// source bitmap lands on the rebaked canvas.
function stubRaster(opts: { loadFails?: boolean; dataUrl?: string } = {}) {
  const draws: DrawCall[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_img: unknown, ...args: number[]) => draws.push({ canvas, args }),
      }),
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
        queueMicrotask(() => (opts.loadFails ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  return draws;
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
    const draws = stubRaster();
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
    const draws = stubRaster();
    await useEditorStore.getState().resizeCanvas(1000, 800, anchor);
    await flush();
    expect(draws[0].args).toEqual([x, y, 800, 600]);
  });

  it("rounds odd centering to whole pixels so the bitmap is not resampled", async () => {
    const draws = stubRaster();
    await useEditorStore.getState().resizeCanvas(1001, 801, "center");
    await flush();
    expect(draws[0].args).toEqual([100, 100, 800, 600]);
  });

  it("shrinking crops instead of scaling", async () => {
    const draws = stubRaster();
    await useEditorStore.getState().resizeCanvas(400, 300, "top-left");
    await flush();
    expect(draws[0].canvas).toMatchObject({ width: 400, height: 300 });
    expect(draws[0].args).toEqual([0, 0, 800, 600]);
  });

  it("leaves the source alone when there is no image", async () => {
    const draws = stubRaster();
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
