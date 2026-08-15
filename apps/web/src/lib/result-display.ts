/**
 * Whether the result area should render the "conversion complete" success card
 * instead of an image, because the processed result has no renderable source.
 *
 * A non-previewable result (TIFF/JXL) whose server preview also failed has no
 * honest src. The side-by-side, no-comparison, plain live-preview, and
 * before-after branches all render `displayUrl` as the result, and `displayUrl`
 * falls back to the original upload, so without this guard they show the
 * untouched original under the processed filename and size (#746).
 *
 * The live-preview + imageWrapperStyle branch is the one exception: with the
 * original present it either simulates the result in CSS (WYSIWYG tools) or
 * handles the missing preview itself (input-overlay tools, #713), so it is not
 * pre-empted here.
 */
export function shouldShowConversionCard(state: {
  hasProcessed: boolean;
  isProcessedPreviewable: boolean;
  processedPreviewUrl: string | null | undefined;
  originalBlobUrl: string | null | undefined;
  displayMode: string;
  hasImageWrapperStyle: boolean;
}): boolean {
  if (!state.hasProcessed) return false;
  const resultIsRenderable = state.processedPreviewUrl != null || state.isProcessedPreviewable;
  if (resultIsRenderable) return false;
  const wysiwygCanRender =
    state.displayMode === "live-preview" &&
    state.hasImageWrapperStyle &&
    state.originalBlobUrl != null;
  return !wysiwygCanRender;
}
