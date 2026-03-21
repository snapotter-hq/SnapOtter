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

export type ImageFormat =
  | "jpg"
  | "png"
  | "webp"
  | "avif"
  | "tiff"
  | "bmp"
  | "gif"
  | "svg"
  | "heic"
  | "jxl"
  | "ico"
  | "raw"
  | "pdf";

export interface SocialMediaPreset {
  platform: string;
  name: string;
  width: number;
  height: number;
}

export interface AppConfig {
  appName: string;
  version: string;
  defaultTheme: "light" | "dark";
  defaultLocale: string;
  maxUploadSizeMb: number;
  maxBatchSize: number;
  maxMegapixels: number;
  authEnabled: boolean;
}

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  uptime: string;
  storage: { mode: string; available: string };
  queue: { active: number; pending: number };
  ai: Record<string, string>;
}

export interface JobProgress {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  currentFile?: string;
  totalFiles?: number;
  downloadUrl?: string;
  error?: string;
}
