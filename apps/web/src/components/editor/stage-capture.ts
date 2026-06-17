// apps/web/src/components/editor/stage-capture.ts
import type Konva from "konva";

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
