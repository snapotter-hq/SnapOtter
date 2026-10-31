// apps/web/src/components/editor/panels/use-document-histogram.ts

import { useEffect, useState } from "react";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import {
  type CaptureFailure,
  captureDocumentContext,
  readDocumentPixels,
} from "@/components/editor/stage-capture";
import { useEditorStore } from "@/stores/editor-store";

/**
 * The document's pixels for the histogram, recaptured after every committed edit.
 *
 * It runs in the background, not on a user action, so a capture that can't be read
 * (a tainted canvas, or one the browser couldn't back) is not a toast: the previous
 * pixels stay in place and `unavailable` says why, for the panel to show (#2139).
 * Any other error is a bug and propagates.
 */
export function useDocumentHistogram(): {
  imageData: ImageData | null;
  unavailable: CaptureFailure | null;
} {
  const canvasSize = useEditorStore((s) => s.canvasSize);
  // Recompute the histogram whenever the committed document changes (paint, delete,
  // adjustments, filters, levels, curves all bump this) so it never shows stale data.
  const historyVersion = useEditorStore((s) => s._historyVersion);

  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [unavailable, setUnavailable] = useState<CaptureFailure | null>(null);

  // historyVersion is an intentional dep: it changes on every committed edit and forces a
  // fresh capture of the rendered stage even though the effect body doesn't read it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see note above
  useEffect(() => {
    function captureImageData() {
      const stage = editorStageRefHolder.current;
      // Not ready yet: the next committed edit captures again.
      if (!stage) return;
      const capture = captureDocumentContext(stage, canvasSize.width, canvasSize.height);
      if (!capture.ok) {
        setUnavailable(capture.reason);
        return;
      }
      const { canvas } = capture.ctx;
      const pixels = readDocumentPixels(capture.ctx, canvas.width, canvas.height);
      if (!pixels.ok) {
        setUnavailable(pixels.reason);
        return;
      }
      setImageData(pixels.imageData);
      setUnavailable(null);
    }

    const timer = setTimeout(captureImageData, 100);
    return () => clearTimeout(timer);
  }, [canvasSize, historyVersion]);

  return { imageData, unavailable };
}
