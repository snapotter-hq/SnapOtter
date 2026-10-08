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

function canvasWith(getImageData: () => unknown, hasContext = true) {
  const ctx = { getImageData };
  return { getContext: () => (hasContext ? ctx : null), ctx };
}

describe("captureDocumentContext", () => {
  it("returns the context when the pixels can be read", () => {
    const canvas = canvasWith(() => ({}));
    const result = captureDocumentContext(
      fakeStage(() => canvas),
      200,
      150,
    );
    expect(result).toEqual({ ok: true, ctx: canvas.ctx });
  });

  it("reports no-context when the canvas refuses a 2D context", () => {
    const canvas = canvasWith(() => ({}), false);
    const result = captureDocumentContext(
      fakeStage(() => canvas),
      200,
      150,
    );
    expect(result).toEqual({ ok: false, reason: "no-context" });
  });

  it("reports tainted when reading the pixels throws a SecurityError", () => {
    const canvas = canvasWith(() => {
      throw new DOMException("The canvas has been tainted", "SecurityError");
    });
    const result = captureDocumentContext(
      fakeStage(() => canvas),
      200,
      150,
    );
    expect(result).toEqual({ ok: false, reason: "tainted" });
  });

  it("reports no-context, and logs, when the capture itself throws", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stage = fakeStage(() => {
      throw new TypeError("Cannot read properties of null");
    });
    expect(captureDocumentContext(stage, 200, 150)).toEqual({ ok: false, reason: "no-context" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("puts the stage back after a failed capture", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stage = fakeStage(() => {
      throw new TypeError("boom");
    });
    captureDocumentContext(stage, 200, 150);
    expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    expect(stage.position).toHaveBeenLastCalledWith({ x: 10, y: 20 });
  });
});
