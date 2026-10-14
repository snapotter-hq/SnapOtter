// apps/web/src/components/editor/copy-merged.ts

import { toast } from "sonner";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { captureDocumentCanvas } from "@/components/editor/stage-capture";
import { copyImageToClipboard } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

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
  const stage = editorStageRefHolder.current;
  if (!stage) return;
  const { canvasSize } = useEditorStore.getState();
  try {
    // The Stage carries zoom and pan as its own transform, so exporting it
    // directly copies the viewport (#1978). captureDocumentCanvas draws the
    // document at its own size first, and HTMLCanvasElement.toBlob throws a
    // tainted canvas's SecurityError onto the toast.
    const canvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("Stage export produced no image");
    }
    if (await copyImageToClipboard(blob)) return;
  } catch (err) {
    console.error("Copy merged failed:", err);
  }
  toast.error(failedMessage);
}
