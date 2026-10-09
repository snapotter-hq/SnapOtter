// apps/web/src/components/editor/tools/eyedropper-tool.tsx

import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";
import type { SampleSize } from "../options/eyedropper-options";
import {
  captureDocumentContext,
  type DocumentContext,
  reportCaptureFailure,
} from "../stage-capture";
import { samplePixelColor } from "./eyedropper-sample";

interface UseEyedropperToolOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  sampleSize: SampleSize;
}

export function useEyedropperTool({
  stageRef,
  sampleSize: _sampleSizeProp,
}: UseEyedropperToolOptions) {
  const setForegroundColor = useEditorStore((s) => s.setForegroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const historyVersion = useEditorStore((s) => s._historyVersion);
  // Use the sampleSize prop directly (caller wires it from options state)
  const sampleSize: SampleSize = _sampleSizeProp;
  const [sampledColor, setSampledColor] = useState<string | null>(null);
  const contextCache = useRef<CanvasRenderingContext2D | null>(null);
  // Set when a capture couldn't be read. Sampling runs on every mousemove, so
  // without it a tainted stage would throw, or toast, once per mouse event.
  const captureFailed = useRef(false);
  const captureMessages = useTranslation().t.editor.ui.captureFailure;

  /**
   * Export the document to a flat canvas at document resolution for pixel
   * sampling, ignoring the current zoom/pan transform.
   * Cached so repeated moves during one drag don't re-export. A capture that
   * can't be read is not retried until the next press, and only a press says so:
   * a hover has no result to show, so it fails quietly (#2139).
   */
  const getStageContext = useCallback(
    (report: boolean): CanvasRenderingContext2D | null => {
      if (captureFailed.current) return null;
      const stage = stageRef.current;
      if (!stage) return null;

      let capture: DocumentContext;
      try {
        capture = captureDocumentContext(stage, canvasSize.width, canvasSize.height);
      } catch (err) {
        // Not ours to explain, but one throw per press, not one per mousemove.
        captureFailed.current = true;
        throw err;
      }
      if (!capture.ok) {
        captureFailed.current = true;
        if (report) reportCaptureFailure(capture.reason, captureMessages);
        return null;
      }
      contextCache.current = capture.ctx;
      return capture.ctx;
    },
    [stageRef, canvasSize, captureMessages],
  );

  /**
   * Invalidate the cache and forgive a failed capture (call on mousedown so
   * we get fresh data).
   */
  const invalidateCache = useCallback(() => {
    contextCache.current = null;
    captureFailed.current = false;
  }, []);

  // A resized canvas or a committed edit makes the cached capture, or the verdict
  // on it, describe a document that is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: both only signal that the document changed
  useEffect(() => {
    invalidateCache();
  }, [canvasSize, historyVersion, invalidateCache]);

  /**
   * Sample color at stage pointer position.
   * Returns the sampled hex color, or null if sampling failed.
   */
  const sampleAtPointer = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, report: boolean): string | null => {
      const stage = e.target.getStage();
      if (!stage) return null;

      const pointer = stage.getPointerPosition();
      if (!pointer) return null;

      const ctx = contextCache.current ?? getStageContext(report);
      if (!ctx) return null;

      // Transform pointer coordinates from screen space to canvas space
      const x = Math.round((pointer.x - panOffset.x) / zoom);
      const y = Math.round((pointer.y - panOffset.y) / zoom);

      // Bounds check against the actual canvas dimensions (unzoomed)
      if (x < 0 || y < 0 || x >= canvasSize.width || y >= canvasSize.height) {
        return null;
      }

      const color = samplePixelColor(ctx, x, y, sampleSize);
      setSampledColor(color);
      return color;
    },
    [getStageContext, sampleSize, zoom, panOffset, canvasSize],
  );

  /**
   * Handle click/mousedown on the canvas for eyedropper sampling.
   * Alt+click sets background color; normal click sets foreground.
   */
  const handleEyedropperClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      invalidateCache();

      const color = sampleAtPointer(e, true);
      if (!color) return;

      if (e.evt.altKey) {
        setBackgroundColor(color);
      } else {
        setForegroundColor(color);
      }
    },
    [invalidateCache, sampleAtPointer, setForegroundColor, setBackgroundColor],
  );

  /**
   * Handle mousemove while eyedropper is active (for live preview).
   */
  const handleEyedropperMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      sampleAtPointer(e, false);
    },
    [sampleAtPointer],
  );

  return {
    handleEyedropperClick,
    handleEyedropperMove,
    sampledColor,
    invalidateCache,
  };
}
