// apps/web/src/components/editor/copy-merged.ts

import { toast } from "sonner";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { captureDocumentCanvas } from "@/components/editor/stage-capture";
import { copyImageToClipboard } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  let resolveBlob!: (blob: Blob) => void;
  let rejectBlob!: (err: unknown) => void;
  const promise = new Promise<Blob>((resolve, reject) => {
    resolveBlob = resolve;
    rejectBlob = reject;
  });
  promise.catch(() => {});
  canvas.toBlob((blob) => {
    if (blob instanceof Blob && blob.size > 0) {
      resolveBlob(blob);
    } else {
      rejectBlob(new Error("Stage export produced no image"));
    }
  }, "image/png");
  return promise;
}

/**
 * Copy Merged: puts the flattened canvas on the system clipboard as a PNG.
 * The Ctrl/Cmd+Shift+C shortcut and the Edit menu row both run this.
 *
 * A failed copy shows `failedMessage` as a toast. That covers a clipboard
 * that refuses the image (copyImageToClipboard resolves false, which is every
 * time on a plain-http install with no async Clipboard API) and an export
 * that fails, such as a canvas tainted by a cross-origin image.
 */
export async function copyMergedToClipboard(failedMessage: string): Promise<void> {
  if (useEditorStore.getState().rebaking) return;
  const stage = editorStageRefHolder.current;
  if (!stage) return;
  const { canvasSize } = useEditorStore.getState();
  try {
    // The Stage carries zoom and pan as its own transform, so exporting it
    // directly copies the viewport (#1978). captureDocumentCanvas draws the
    // document at its own size first, and HTMLCanvasElement.toBlob throws a
    // tainted canvas's SecurityError onto the toast. Pass the export promise
    // straight into copyImageToClipboard so navigator.clipboard.write starts
    // inside WebKit's user gesture (#1979).
    const canvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);
    if (await copyImageToClipboard(canvasToPngBlob(canvas))) return;
  } catch (err) {
    console.error("Copy merged failed:", err);
  }
  toast.error(failedMessage);
}
