import { describe, expect, it, vi } from "vitest";
import {
  captureDocumentContext,
  classifyCaptureError,
  readDocumentPixels,
  strokeToDataUrl,
} from "../../../apps/web/src/components/editor/stage-capture";

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

describe("readDocumentPixels", () => {
  const ctxOf = (getImageData: () => unknown) =>
    ({ getImageData }) as unknown as CanvasRenderingContext2D;

  it("hands back the whole document's pixels", () => {
    const imageData = { data: new Uint8ClampedArray(16) };
    const result = readDocumentPixels(
      ctxOf(() => imageData),
      2,
      2,
    );
    expect(result).toEqual({ ok: true, imageData });
  });

  it.each([
    ["a RangeError", new RangeError("Out of memory at ImageData creation")],
    ["IndexSizeError", new DOMException("empty", "IndexSizeError")],
    ["NS_ERROR_FAILURE", new Error("NS_ERROR_FAILURE")],
  ])("reports no-context when the full read fails with %s", (_label, error) => {
    const result = readDocumentPixels(
      ctxOf(() => {
        throw error;
      }),
      2,
      2,
    );
    expect(result).toEqual({ ok: false, reason: "no-context" });
  });

  it("lets an error that isn't about canvas size propagate", () => {
    expect(() =>
      readDocumentPixels(
        ctxOf(() => {
          throw new TypeError("not a size problem");
        }),
        2,
        2,
      ),
    ).toThrow("not a size problem");
  });
});

describe("classifyCaptureError", () => {
  it("calls a SecurityError a tainted canvas", () => {
    expect(classifyCaptureError(new DOMException("tainted", "SecurityError"))).toBe("tainted");
  });

  it.each([
    ["a RangeError", new RangeError("Invalid array length")],
    ["an IndexSizeError", new DOMException("The source width is 0", "IndexSizeError")],
    ["Firefox's NS_ERROR_FAILURE", new Error("NS_ERROR_FAILURE")],
  ])("calls %s a canvas the browser could not back", (_label, err) => {
    expect(classifyCaptureError(err)).toBe("no-context");
  });

  it("calls an InvalidStateError a canvas the browser could not back", () => {
    // Firefox past its limit: "CanvasRenderingContext2D.scale: Canvas exceeds max size."
    expect(
      classifyCaptureError(new DOMException("Canvas exceeds max size.", "InvalidStateError")),
    ).toBe("no-context");
  });

  it("leaves a bug alone", () => {
    expect(classifyCaptureError(new TypeError("Cannot read properties of null"))).toBeNull();
    expect(classifyCaptureError("not even an error")).toBeNull();
  });
});

describe("strokeToDataUrl (#2141)", () => {
  const canvasWith = (toDataURL: () => string) => ({ toDataURL }) as unknown as HTMLCanvasElement;

  it("returns the data URL", () => {
    expect(strokeToDataUrl(canvasWith(() => "data:image/png;base64,AAAA"))).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("returns null for the empty URL a canvas past the browser's limit gives back", () => {
    expect(strokeToDataUrl(canvasWith(() => "data:,"))).toBeNull();
  });

  it("returns null when encoding fails on size", () => {
    const canvas = canvasWith(() => {
      throw new RangeError("Invalid string length");
    });
    expect(strokeToDataUrl(canvas)).toBeNull();
  });

  it("lets an error that isn't about canvas size propagate", () => {
    const canvas = canvasWith(() => {
      throw new TypeError("boom");
    });
    expect(() => strokeToDataUrl(canvas)).toThrow(TypeError);
  });
});
