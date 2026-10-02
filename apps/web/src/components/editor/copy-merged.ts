// apps/web/src/components/editor/copy-merged.ts

import { toast } from "sonner";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
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
    // toBlob, not toDataURL: Konva's toDataURL catches a tainted canvas's
    // SecurityError and returns "", which would copy no image without failing.
    const blob = await stage.toBlob({
      pixelRatio: 1,
      mimeType: "image/png",
      x: 0,
      y: 0,
      width: canvasSize.width,
      height: canvasSize.height,
    });
    if (!(blob instanceof Blob)) throw new Error("Stage export produced no image");
    if (await copyImageToClipboard(blob)) return;
  } catch (err) {
    console.error("Copy merged failed:", err);
  }
  toast.error(failedMessage);
}
