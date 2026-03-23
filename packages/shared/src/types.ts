export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  route: string;
  shortcut?: string;
  disabled?: boolean;
  alpha?: boolean;
}

export type ToolCategory =
  | "essentials"
  | "optimization"
  | "adjustments"
  | "ai"
  | "watermark"
  | "utilities"
  | "layout"
  | "format"
  | "automation";

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
