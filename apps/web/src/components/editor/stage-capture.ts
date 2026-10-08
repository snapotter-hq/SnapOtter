// apps/web/src/components/editor/stage-capture.ts
import type Konva from "konva";
import { toast } from "sonner";

/**
 * Capture the editor document as a flat HTMLCanvasElement at document-pixel
 * resolution, independent of the current zoom/pan.
 *
 * The Stage carries the editor's zoom/pan as a transform (scaleX/scaleY/x/y).
 * `stage.toCanvas()` bakes that transform into its output, so the naive
 * `stage.toCanvas({ x: 0, y: 0, width, height })` returns the *viewport* — the
 * document scaled and offset by the current zoom/pan, clipped to the on-screen
 * stage size — instead of the document in its own coordinate space (issue
 * #259). Every pixel tool (fill, magic wand, clone stamp, eyedropper,
 * dodge/burn, blur/sharpen/smudge) and the exporter need the document pixels,
 * so we temporarily normalize the stage to the document size with an identity
 * transform, render, capture, then restore.
 *
 * This runs synchronously inside the calling event handler, so the browser
 * never paints the intermediate (resized) state — there is no visible flicker.
 * The stage is always restored, even if the capture throws.
 */
export function captureDocumentCanvas(
  stage: Konva.Stage,
  width: number,
  height: number,
  pixelRatio = 1,
): HTMLCanvasElement {
  const prev = {
    width: stage.width(),
    height: stage.height(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
    x: stage.x(),
    y: stage.y(),
  };
  try {
    stage.size({ width, height });
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.draw();
    return stage.toCanvas({ pixelRatio, x: 0, y: 0, width, height });
  } finally {
    stage.size({ width: prev.width, height: prev.height });
    stage.scale({ x: prev.scaleX, y: prev.scaleY });
    stage.position({ x: prev.x, y: prev.y });
    stage.draw();
  }
}

/** Why a pixel tool couldn't read the document. */
export type CaptureFailure = "no-context" | "tainted";

export type DocumentContext =
  | { ok: true; ctx: CanvasRenderingContext2D }
  | { ok: false; reason: CaptureFailure };

/** The user-facing text for each way a capture can fail (`editor.ui.captureFailure`). */
export interface CaptureFailureMessages {
  noCanvasMemory: string;
  crossOriginBlocked: string;
}

/**
 * Tell the user why a pixel tool did nothing, instead of leaving the click silent.
 * The fixed ids keep ten clone-stamp dabs from queuing ten identical toasts.
 */
export function reportCaptureFailure(
  reason: CaptureFailure,
  messages: CaptureFailureMessages,
): void {
  if (reason === "tainted") {
    toast.error(messages.crossOriginBlocked, { id: "editor-capture-tainted" });
  } else {
    toast.error(messages.noCanvasMemory, { id: "editor-capture-no-context" });
  }
}

// Past the browser's canvas limits, Chromium and WebKit still return a context.
// It draws nothing and reads back zeros, so the only way to tell is to write a
// pixel and read it back. The pixel is put back afterwards; the canvas is the
// throwaway capture, and an opaque or fully transparent pixel survives the trip
// exactly.
function canvasIsDead(ctx: CanvasRenderingContext2D): boolean {
  const original = ctx.getImageData(0, 0, 1, 1);
  const probe = ctx.createImageData(1, 1);
  probe.data.set([255, 0, 255, 255]);
  ctx.putImageData(probe, 0, 0);
  const alpha = ctx.getImageData(0, 0, 1, 1).data[3];
  ctx.putImageData(original, 0, 0);
  return alpha !== 255;
}

// What a browser throws when a canvas is too big to read back: RangeError from the
// pixel buffer in Chromium and WebKit, IndexSizeError for an empty source, and
// NS_ERROR_FAILURE in Firefox. Anything else is a bug and is left to propagate.
function isCanvasSizeError(err: unknown): boolean {
  if (err instanceof RangeError) return true;
  if (err instanceof DOMException) return err.name === "IndexSizeError";
  return err instanceof Error && err.message.includes("NS_ERROR_FAILURE");
}

/**
 * Capture the document and hand back a 2D context whose pixels the caller may
 * read, or say why not. The pixel tools used to bail out of the mouse handler on a
 * null context and let a tainted canvas's SecurityError escape it, so a click did
 * nothing and nobody was told (issue #1040).
 *
 * `no-context` is the browser unable to back a document-sized canvas: a null
 * context, a context that draws nothing (see canvasIsDead), or a read that fails
 * on size. `tainted` is a cross-origin image loaded without CORS: drawing it is
 * allowed, reading it back throws, and the 1px read in canvasIsDead finds out.
 * Any other error is not ours to explain and propagates.
 */
export function captureDocumentContext(
  stage: Konva.Stage,
  width: number,
  height: number,
): DocumentContext {
  try {
    const ctx = captureDocumentCanvas(stage, width, height).getContext("2d");
    if (!ctx || canvasIsDead(ctx)) return { ok: false, reason: "no-context" };
    return { ok: true, ctx };
  } catch (err) {
    if (err instanceof DOMException && err.name === "SecurityError") {
      return { ok: false, reason: "tainted" };
    }
    if (isCanvasSizeError(err)) return { ok: false, reason: "no-context" };
    throw err;
  }
}
