import { MEDIA_PREVIEW_AUDIO_EXTS, MEDIA_PREVIEW_VIDEO_EXTS } from "@snapotter/shared";

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
 * Display modes that never swap the main area for the conversion-complete card:
 * generator tools have no input file, and interactive-sign keeps its signature
 * canvas mounted even after signing (#1969).
 */
const NEVER_CONVERSION_CARD_MODES = new Set(["no-dropzone", "interactive-sign"]);

/**
 * Display modes that render their own viewer or panel (pdf.js, <video>/<audio>,
 * or a dedicated ResultsPanel) rather than an <img> tag fed by `displayUrl`.
 * For these modes `isProcessedPreviewable` (which checks image extensions only)
 * is false on single-file `/api/...` download URLs even though the mode's own
 * viewer can render `processedUrl` directly. They only show the conversion card
 * when a completed result has no `processedUrl` at all, such as a large batch
 * whose ZIP extraction was skipped (#1240, #2449).
 */
const SELF_RENDERING_RESULT_MODES = new Set([
  "media-player",
  "document",
  "custom-results",
  "interactive-split",
]);

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
  processedUrl: string | null | undefined;
  processedPreviewUrl: string | null | undefined;
  originalBlobUrl: string | null | undefined;
  displayMode: string;
  hasImageWrapperStyle: boolean;
}): boolean {
  if (!state.hasProcessed) return false;
  if (NEVER_CONVERSION_CARD_MODES.has(state.displayMode)) return false;
  if (SELF_RENDERING_RESULT_MODES.has(state.displayMode)) {
    return state.processedUrl == null;
  }
  const resultIsRenderable =
    state.processedPreviewUrl != null ||
    (state.isProcessedPreviewable && state.processedUrl != null);
  if (resultIsRenderable) return false;
  const wysiwygCanRender =
    state.displayMode === "live-preview" &&
    state.hasImageWrapperStyle &&
    state.originalBlobUrl != null;
  return !wysiwygCanRender;
}

// What <video> plays without help; the media player shows these directly.
const BROWSER_VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "ogv", "m4v", "mov"]);
// A GIF input (gif-to-video) or an image result (video-to-gif, video-to-webp).
const IMAGE_EXTS = new Set(["gif", "webp", "png", "jpg", "jpeg", "apng"]);

export type VideoAreaView = "player" | "image" | "server-preview" | "no-preview";

/**
 * How the media-player area shows a file, by its name: the native player, an
 * image, the server's preview transcode, or nothing. Only names the transcode
 * accepts go to it; anything else drew a 400 and a "preview failed" panel
 * (WEB-2M, #4666).
 */
export function videoAreaView(filename: string): VideoAreaView {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
  if (!ext || BROWSER_VIDEO_EXTS.has(ext)) return "player";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (MEDIA_PREVIEW_VIDEO_EXTS.has(ext) || MEDIA_PREVIEW_AUDIO_EXTS.has(ext)) {
    return "server-preview";
  }
  return "no-preview";
}
