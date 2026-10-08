// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

const analytics = vi.hoisted(() => ({
  captureHandledError: vi.fn(async () => null),
  track: vi.fn(),
  getDistinctId: vi.fn(() => "test"),
}));
vi.mock("@/lib/analytics", () => analytics);

import { useEditorStore } from "@/stores/editor-store";
import type { CanvasObject } from "@/types/editor";

type DrawCall = { canvas: { width: number; height: number }; args: number[] };

// jsdom has no canvas or image decoding, so stand both in and record where the
// source bitmap lands on the rebaked canvas.
function stubRaster() {
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
      toDataURL: () => "data:image/png;base64,REBAKED",
    };
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  return draws;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function rect(x: number, y: number): CanvasObject {
  return {
    id: "r1",
    type: "rect",
    layerId: useEditorStore.getState().activeLayerId,
    attrs: {
      x,
      y,
      width: 200,
      height: 100,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 0,
      cornerRadius: 0,
      rotation: 0,
      opacity: 1,
    },
  };
}

describe("trim and crop move the source bitmap with the canvas (#2069)", () => {
  beforeEach(() => {
    useEditorStore.getState().loadImage("blob:test", 800, 600);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("trim crops the bitmap to the content bounds instead of squashing it", async () => {
    const draws = stubRaster();
    useEditorStore.getState().addObject(rect(100, 50));
    useEditorStore.getState().trimCanvas();
    await flush();
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 200, height: 100 });
    expect(draws).toHaveLength(1);
    expect(draws[0].canvas).toMatchObject({ width: 200, height: 100 });
    expect(draws[0].args).toEqual([-100, -50, 800, 600]);
    expect(useEditorStore.getState().sourceImageUrl).toBe("data:image/png;base64,REBAKED");
  });

  // Crop no longer takes this path: it builds the bitmap first and rejects on failure
  // (editor-rebake-transforms.test.ts). Trim still commits first, so its failure has to be
  // reported here.
  it("reports a failed trim rebake instead of swallowing it", async () => {
    stubRaster();
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    useEditorStore.getState().addObject(rect(100, 50));
    useEditorStore.getState().trimCanvas();
    await flush();
    expect(logged).toHaveBeenCalledWith(
      "Trim could not update the source image",
      expect.any(Error),
    );
    // The console alone never reaches Sentry; the report must carry the root cause.
    await vi.waitFor(() =>
      expect(analytics.captureHandledError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Could not update the source image after a trim",
          isSafeMessage: true,
          cause: expect.any(Error),
        }),
        { error_class: "bug", tool_id: "editor-trim" },
      ),
    );
    // The canvas change already committed, so the original bitmap stays as is.
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 200, height: 100 });
    expect(useEditorStore.getState().sourceImageUrl).toBe("blob:test");
  });

  it("crop draws the bitmap at the canvas size, so it works after Image Size", async () => {
    const draws = stubRaster();
    useEditorStore.getState().resizeImage(400, 300);
    useEditorStore.getState().setCropState({
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      aspectRatio: null,
    });
    useEditorStore.getState().applyCrop();
    await flush();
    expect(draws).toHaveLength(1);
    expect(draws[0].canvas).toMatchObject({ width: 200, height: 100 });
    // The bitmap is drawn 400x300 after the resize, not at its natural 800x600.
    expect(draws[0].args).toEqual([-100, -50, 400, 300]);
  });
});
