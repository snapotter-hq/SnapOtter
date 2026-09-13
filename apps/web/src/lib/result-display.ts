/**
 * The claim handler for a media player's download link, or undefined when the
 * player is showing the original upload.
 *
 * The player is handed one source (`processedUrl ?? originalBlobUrl`) and offers
 * that same file for download, so the link is a result download only when a
 * result exists. Claiming on the original would tell the navigation guard the
 * result had been taken when nothing was taken at all, and the guard would then
 * let a real, untaken result go without a word.
 *
 * A function rather than a ternary at the call site so the decision can be
 * tested: inverting it has to fail something.
 */
export function playerDownloadClaim(
  processedUrl: string | null | undefined,
  claim: () => void,
): (() => void) | undefined {
  return processedUrl ? claim : undefined;
}

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
