import type { Modality } from "@snapotter/shared";
import type { InputHandler } from "./contract.js";
import { DocumentInputHandler } from "./document-input.js";
import { ImageInputHandler } from "./image-input.js";
import { MediaInputHandler } from "./media-input.js";

const HANDLERS: Record<Modality, InputHandler> = {
  image: new ImageInputHandler(),
  video: new MediaInputHandler("video"),
  audio: new MediaInputHandler("audio"),
  document: new DocumentInputHandler(),
  file: new DocumentInputHandler(),
};

export function inputHandlerFor(modality: Modality): InputHandler {
  return HANDLERS[modality];
}
