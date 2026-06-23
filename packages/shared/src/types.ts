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
