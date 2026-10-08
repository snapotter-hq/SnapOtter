import { describe, expect, it, vi } from "vitest";
import { captureDocumentContext } from "../../../apps/web/src/components/editor/stage-capture";

type Stage = Parameters<typeof captureDocumentContext>[0];

// A stage that remembers the transform it was given and returns whatever canvas the
// test wants from toCanvas, which is all captureDocumentContext touches.
function fakeStage(toCanvas: () => unknown): Stage {
  const stage = {
    width: () => 800,
    height: () => 600,
    scaleX: () => 2,
    scaleY: () => 2,
    x: () => 10,
    y: () => 20,
    size: vi.fn(),
    scale: vi.fn(),
    position: vi.fn(),
    draw: vi.fn(),
    toCanvas,
  };
  return stage as unknown as Stage;
}

interface FakeContext {
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  createImageData: () => { data: Uint8ClampedArray };
}

// A 2D context over one pixel. `alive` is what Chromium and WebKit do not do past
// their canvas limits: a dead context takes the write and reads back zeros.
function fakeContext(options: { alive: boolean; readThrows?: unknown } = { alive: true }) {
  let pixel = new Uint8ClampedArray([10, 20, 30, 255]);
  const ctx: FakeContext = {
    getImageData: vi.fn(() => {
      if (options.readThrows) throw options.readThrows;
      return { data: options.alive ? pixel.slice() : new Uint8ClampedArray(4) };
    }),
    putImageData: vi.fn((image: { data: Uint8ClampedArray }) => {
      if (options.alive) pixel = image.data.slice();
    }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return { ctx, pixel: () => pixel };
}

const canvasOf = (ctx: unknown) => ({ getContext: () => ctx });
const capture = (toCanvas: () => unknown) => captureDocumentContext(fakeStage(toCanvas), 200, 150);

describe("captureDocumentContext", () => {
  it("returns the context when the pixels can be read and written", () => {
    const { ctx } = fakeContext();
    expect(capture(() => canvasOf(ctx))).toEqual({ ok: true, ctx });
  });

  it("puts the probed pixel back", () => {
    const { ctx, pixel } = fakeContext();
    capture(() => canvasOf(ctx));
    expect(Array.from(pixel())).toEqual([10, 20, 30, 255]);
  });

  it("reports no-context when the canvas refuses a 2D context", () => {
    expect(capture(() => canvasOf(null))).toEqual({ ok: false, reason: "no-context" });
  });

  it("reports no-context for a context that draws nothing and reads zeros", () => {
    const { ctx } = fakeContext({ alive: false });
    expect(capture(() => canvasOf(ctx))).toEqual({ ok: false, reason: "no-context" });
  });

  it("reports tainted when reading the pixels throws a SecurityError", () => {
    const { ctx } = fakeContext({
      alive: true,
      readThrows: new DOMException("The canvas has been tainted", "SecurityError"),
    });
    expect(capture(() => canvasOf(ctx))).toEqual({ ok: false, reason: "tainted" });
  });

  it.each([
    ["a RangeError", new RangeError("Cannot allocate a buffer of this size")],
    ["an IndexSizeError", new DOMException("The source width is 0", "IndexSizeError")],
    ["Firefox's NS_ERROR_FAILURE", new Error("NS_ERROR_FAILURE")],
  ])("reports no-context when the read fails on %s", (_label, readThrows) => {
    const { ctx } = fakeContext({ alive: true, readThrows });
    expect(capture(() => canvasOf(ctx))).toEqual({ ok: false, reason: "no-context" });
  });

  it("reports no-context when the capture throws a size error", () => {
    expect(
      capture(() => {
        throw new RangeError("Invalid array length");
      }),
    ).toEqual({ ok: false, reason: "no-context" });
  });

  it("lets an error that isn't about canvas size or taint propagate", () => {
    expect(() =>
      capture(() => {
        throw new TypeError("Cannot read properties of null");
      }),
    ).toThrow(TypeError);
  });

  it("puts the stage back after a failed capture", () => {
    const stage = fakeStage(() => {
      throw new TypeError("boom");
    });
    expect(() => captureDocumentContext(stage, 200, 150)).toThrow();
    expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    expect(stage.position).toHaveBeenLastCalledWith({ x: 10, y: 20 });
  });
});
