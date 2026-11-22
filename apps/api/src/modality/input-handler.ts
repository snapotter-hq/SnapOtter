import type { Modality } from "@snapotter/shared";
import type { InputHandler } from "./contract.js";
import { DocumentInputHandler } from "./document-input.js";
import { ImageInputHandler } from "./image-input.js";
import { MediaInputHandler, type MediaInputKind } from "./media-input.js";

const HANDLERS: Record<Modality, InputHandler> = {
  image: new ImageInputHandler(),
  video: new MediaInputHandler("video"),
  audio: new MediaInputHandler("audio"),
  document: new DocumentInputHandler(),
  file: new DocumentInputHandler(),
};

// Image slots keep the full image pipeline so RAW/HEIC/SVG inputs are
// normalized, not just probed.
const KIND_HANDLERS: Record<MediaInputKind, InputHandler> = {
  video: HANDLERS.video,
  audio: HANDLERS.audio,
  image: HANDLERS.image,
  subtitle: new MediaInputHandler("subtitle"),
};

export function inputHandlerFor(modality: Modality): InputHandler {
  return HANDLERS[modality];
}

/**
 * The handler for upload `position` of a tool. A tool's `inputKinds` win over
 * its modality (convert-subtitles is a video tool that takes .srt), and the
 * last kind covers every later position. Batch and pipeline entry points must
 * use this too, or they validate a subtitle upload as video (#5165).
 */
export function inputHandlerForInput(
  modality: Modality,
  inputKinds: readonly MediaInputKind[] | undefined,
  position = 0,
): InputHandler {
  if (!inputKinds?.length) return inputHandlerFor(modality);
  return KIND_HANDLERS[inputKinds[Math.min(position, inputKinds.length - 1)]];
}
