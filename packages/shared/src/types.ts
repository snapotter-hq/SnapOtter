import type { Modality } from "./modality.js";

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  route: string;
  modality: Modality;
  acceptedInputs: string[];
  /** Optional search aliases/variants (e.g. "jpeg to png", "jpg2png"). Indexed by app + landing search. */
  keywords?: string[];
  /** Modality of this tool's output, when it differs from `modality`. Defaults to `modality`. */
  outputModality?: Modality;
  executionHint: "fast" | "long";
  maxInputSizeMB?: number;
  shortcut?: string;
  disabled?: boolean;
  experimental?: boolean;
}

export type ToolCategory =
  // Image
  | "essentials"
  | "optimization"
  | "adjustments"
  | "enhance"
  | "watermark"
  | "utilities"
  | "layout"
  | "format"
  // Video
  | "video-edit"
  | "video-convert"
  | "video-effects"
  | "video-subtitles"
  | "video-metadata"
  // Audio
  | "audio-edit"
  | "audio-convert"
  | "audio-effects"
  | "audio-metadata"
  // Documents
  | "pdf-organize"
  | "pdf-edit"
  | "pdf-security"
  | "pdf-optimize"
  | "doc-convert"
  // Data & Files
  | "data"
  | "archives";

/**
 * How a tool result is saved back to the file library when the input came
 * from it (issue #495). "new" keeps the original and adds an independent
 * file; "overwrite" supersedes the original with a linked version. The
 * default everywhere is "new" so users never lose an original by accident.
 */
export const LIBRARY_SAVE_MODES = ["new", "overwrite"] as const;
export type LibrarySaveMode = (typeof LIBRARY_SAVE_MODES)[number];

export interface CategoryInfo {
  id: ToolCategory;
  name: string;
  icon: string;
  color: string;
}

export interface SocialMediaPreset {
  platform: string;
  name: string;
  width: number;
  height: number;
}

/**
 * A signature placed on a PDF page by the sign-pdf tool. Coordinates are page
 * fractions (0..1), top-left origin; `sig` indexes the uploaded signature PNGs.
 */
export interface SignPlacement {
  sig: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
