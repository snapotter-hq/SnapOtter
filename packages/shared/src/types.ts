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
  executionHint: "fast" | "long";
  maxInputSizeMB?: number;
  shortcut?: string;
  disabled?: boolean;
  experimental?: boolean;
}

export type ToolCategory =
  | "essentials"
  | "optimization"
  | "adjustments"
  | "ai"
  | "watermark"
  | "utilities"
  | "layout"
  | "format";

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
