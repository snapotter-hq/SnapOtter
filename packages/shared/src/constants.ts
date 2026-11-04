import { expandCompressPresets } from "./compress-presets.js";
import { expandConversionPresets } from "./conversion-presets.js";
import { toolSection } from "./section.js";
import { AUDIO_TOOLS } from "./tools/audio.js";
import { DOCUMENT_TOOLS } from "./tools/documents.js";
import { FILE_TOOLS } from "./tools/files.js";
import { IMAGE_TOOLS } from "./tools/image.js";
import { VIDEO_TOOLS } from "./tools/video.js";
import type { CategoryInfo, SocialMediaPreset, Tool } from "./types.js";

export const PDF_MULTI_TOOL_LIMITS = { documents: 20, outputPages: 1200 } as const;

/**
 * Largest width or height, in pixels, the resize-style tools accept. The API schemas
 * enforce it (image-engine re-exports it for them); web panels import it from here
 * to bound their inputs.
 */
export const MAX_RESIZE_OUTPUT_DIMENSION = 16383;

/**
 * Largest width x height product the resize-style tools accept, in pixels (64 MP).
 * Defined here for the same reason as the side ceiling: the API schemas and the web
 * panels must agree on it, and the panels cannot import the Node image engine.
 */
export const MAX_RESIZE_OUTPUT_PIXELS = 67_108_864;

/**
 * Largest scale factor, in percent, the resize route accepts.
 */
export const MAX_RESIZE_PERCENTAGE = 1000;

/**
 * Largest width x height product the content-aware resize route accepts, in pixels
 * (25 MP). Seam carving is far more expensive than a plain resize, so it cannot use
 * the full MAX_RESIZE_OUTPUT_PIXELS budget.
 */
export const MAX_CONTENT_AWARE_RESIZE_PIXELS = 25_000_000;

export const CATEGORIES: CategoryInfo[] = [
  // Image
  { id: "essentials", name: "Essentials", icon: "Layers", color: "#3B82F6" },
  { id: "adjustments", name: "Adjustments", icon: "SlidersHorizontal", color: "#8B5CF6" },
  { id: "enhance", name: "Enhance & AI", icon: "Sparkles", color: "#F59E0B" },
  { id: "watermark", name: "Watermark & Overlay", icon: "Stamp", color: "#EF4444" },
  { id: "layout", name: "Layout & Composition", icon: "LayoutGrid", color: "#EC4899" },
  { id: "utilities", name: "Utilities", icon: "Wrench", color: "#6366F1" },
  { id: "optimization", name: "Optimization", icon: "Zap", color: "#10B981" },
  { id: "format", name: "Format & Conversion", icon: "FileType", color: "#14B8A6" },
  // Video
  { id: "video-edit", name: "Edit", icon: "Video", color: "#EF4444" },
  { id: "video-convert", name: "Convert", icon: "FileVideo", color: "#F97316" },
  { id: "video-effects", name: "Effects & Compose", icon: "Wand2", color: "#EC4899" },
  { id: "video-subtitles", name: "Subtitles", icon: "Captions", color: "#8B5CF6" },
  { id: "video-metadata", name: "Metadata", icon: "Tags", color: "#6366F1" },
  // Audio
  { id: "audio-edit", name: "Edit", icon: "AudioLines", color: "#10B981" },
  { id: "audio-convert", name: "Convert", icon: "FileAudio", color: "#14B8A6" },
  { id: "audio-effects", name: "Effects & Compose", icon: "Waves", color: "#06B6D4" },
  { id: "audio-metadata", name: "Metadata", icon: "Tags", color: "#6366F1" },
  // Documents
  { id: "pdf-organize", name: "Organize", icon: "FolderOpen", color: "#8B5CF6" },
  { id: "pdf-edit", name: "Edit & Annotate", icon: "PenLine", color: "#3B82F6" },
  { id: "pdf-security", name: "Security", icon: "Lock", color: "#EF4444" },
  { id: "pdf-optimize", name: "Optimize", icon: "Zap", color: "#10B981" },
  { id: "doc-convert", name: "Convert", icon: "FileType", color: "#14B8A6" },
  // Data & Files
  { id: "data", name: "Files", icon: "Table", color: "#F59E0B" },
  { id: "archives", name: "Archives", icon: "FolderArchive", color: "#6366F1" },
];

// Order is load-bearing: UI listings, counts and drift tests follow it. Each file
// is one contiguous block of the original list, so a few tools sit outside the
// file their toolSection() would suggest (ocr-pdf lives in image.ts).
const BASE_TOOLS: Tool[] = [
  ...IMAGE_TOOLS,
  ...VIDEO_TOOLS,
  ...AUDIO_TOOLS,
  ...DOCUMENT_TOOLS,
  ...FILE_TOOLS,
];

export const TOOLS: Tool[] = [
  ...BASE_TOOLS,
  ...expandConversionPresets(BASE_TOOLS),
  ...expandCompressPresets(BASE_TOOLS),
];

for (const tool of TOOLS) {
  const slug = `/${toolSection(tool)}`;
  if (!tool.route.startsWith(`${slug}/`)) {
    tool.route = `${slug}${tool.route}`;
  }
}

export function apiToolPath(
  toolOrId: string | Pick<Tool, "id" | "modality" | "acceptedInputs">,
): string {
  const tool = typeof toolOrId === "string" ? TOOLS.find((t) => t.id === toolOrId) : toolOrId;
  if (!tool) throw new Error(`apiToolPath: unknown tool "${String(toolOrId)}"`);
  return `/api/v1/tools/${toolSection(tool)}/${tool.id}`;
}

export const SOCIAL_MEDIA_PRESETS: SocialMediaPreset[] = [
  { platform: "Instagram", name: "Post (Square)", width: 1080, height: 1080 },
  { platform: "Instagram", name: "Story / Reel", width: 1080, height: 1920 },
  { platform: "Instagram", name: "Profile Picture", width: 320, height: 320 },
  { platform: "Instagram", name: "Landscape Post", width: 1080, height: 566 },
  { platform: "Instagram", name: "Portrait Post", width: 1080, height: 1350 },
  { platform: "Twitter/X", name: "Post Image", width: 1200, height: 675 },
  { platform: "Twitter/X", name: "Header", width: 1500, height: 500 },
  { platform: "Twitter/X", name: "Profile Picture", width: 400, height: 400 },
  { platform: "Facebook", name: "Post Image", width: 1200, height: 630 },
  { platform: "Facebook", name: "Cover Photo", width: 820, height: 312 },
  { platform: "Facebook", name: "Profile Picture", width: 170, height: 170 },
  { platform: "Facebook", name: "Event Cover", width: 1920, height: 1005 },
  { platform: "YouTube", name: "Thumbnail", width: 1280, height: 720 },
  { platform: "YouTube", name: "Channel Banner", width: 2560, height: 1440 },
  { platform: "YouTube", name: "Profile Picture", width: 800, height: 800 },
  { platform: "LinkedIn", name: "Post Image", width: 1200, height: 627 },
  { platform: "LinkedIn", name: "Banner", width: 1584, height: 396 },
  { platform: "LinkedIn", name: "Profile Picture", width: 400, height: 400 },
  { platform: "TikTok", name: "Video Cover", width: 1080, height: 1920 },
  { platform: "TikTok", name: "Profile Picture", width: 200, height: 200 },
  { platform: "WhatsApp", name: "Profile Picture", width: 500, height: 500 },
  { platform: "Pinterest", name: "Pin", width: 1000, height: 1500 },
  { platform: "Threads", name: "Post Image", width: 1080, height: 1080 },
];

export interface SmartCropFacePreset {
  id: string;
  label: string;
  multiplier: number;
}

export const SMART_CROP_FACE_PRESETS: SmartCropFacePreset[] = [
  { id: "closeup", label: "Close-up", multiplier: 1.8 },
  { id: "head-shoulders", label: "Head & Shoulders", multiplier: 2.8 },
  { id: "upper-body", label: "Upper Body", multiplier: 4.5 },
  { id: "half-body", label: "Half Body", multiplier: 7.0 },
];

// ---------------------------------------------------------------------------
// Passport / ID Photo Specs
// ---------------------------------------------------------------------------

export type PassportRegion = "americas" | "europe" | "asia" | "africa" | "oceania" | "middle-east";

export interface PassportDocumentSpec {
  type: string;
  label: string;
  width: number; // mm
  height: number; // mm
  dpi: number;
  headHeightMin: number; // fraction of photo height
  headHeightMax: number; // fraction of photo height
  eyeLineFromBottom: number; // fraction of photo height
  bgColor: string; // default background hex
  bgColors: string[]; // allowed background colors
}

export interface PassportSpec {
  code: string;
  name: string;
  flag: string;
  region: PassportRegion;
  documents: PassportDocumentSpec[];
}

export const PASSPORT_SPECS: PassportSpec[] = [
  // Americas
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    region: "americas",
    documents: [
      {
        type: "passport",
        label: "US Passport",
        width: 51,
        height: 51,
        dpi: 300,
        headHeightMin: 0.5,
        headHeightMax: 0.69,
        eyeLineFromBottom: 0.56,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    region: "americas",
    documents: [
      {
        type: "passport",
        label: "Canadian Passport",
        width: 50,
        height: 70,
        dpi: 300,
        headHeightMin: 0.44,
        headHeightMax: 0.51,
        eyeLineFromBottom: 0.55,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "BR",
    name: "Brazil",
    flag: "🇧🇷",
    region: "americas",
    documents: [
      {
        type: "passport",
        label: "Brazilian Passport",
        width: 50,
        height: 70,
        dpi: 300,
        headHeightMin: 0.5,
        headHeightMax: 0.69,
        eyeLineFromBottom: 0.56,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "MX",
    name: "Mexico",
    flag: "🇲🇽",
    region: "americas",
    documents: [
      {
        type: "passport",
        label: "Mexican Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  // Europe
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "UK Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#D4D4D4",
        bgColors: ["#D4D4D4"],
      },
    ],
  },
  {
    code: "EU",
    name: "European Union",
    flag: "🇪🇺",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "EU Passport (ICAO)",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF", "#D4D4D4"],
      },
    ],
  },
  {
    code: "DE",
    name: "Germany",
    flag: "🇩🇪",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "German Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#D4D4D4",
        bgColors: ["#D4D4D4"],
      },
    ],
  },
  {
    code: "FR",
    name: "France",
    flag: "🇫🇷",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "French Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#D4D4D4",
        bgColors: ["#D4D4D4", "#BFDBFE"],
      },
    ],
  },
  {
    code: "RU",
    name: "Russia",
    flag: "🇷🇺",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Russian Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "TR",
    name: "Turkey",
    flag: "🇹🇷",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Turkish Passport",
        width: 50,
        height: 60,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "IE",
    name: "Ireland",
    flag: "\u{1F1EE}\u{1F1EA}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Irish Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "IT",
    name: "Italy",
    flag: "\u{1F1EE}\u{1F1F9}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Italian Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "ES",
    name: "Spain",
    flag: "\u{1F1EA}\u{1F1F8}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Spanish Passport",
        width: 26,
        height: 32,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "NL",
    name: "Netherlands",
    flag: "\u{1F1F3}\u{1F1F1}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Dutch Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "PL",
    name: "Poland",
    flag: "\u{1F1F5}\u{1F1F1}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Polish Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "SE",
    name: "Sweden",
    flag: "\u{1F1F8}\u{1F1EA}",
    region: "europe",
    documents: [
      {
        type: "passport",
        label: "Swedish Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  // Asia
  {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Indian Passport",
        width: 51,
        height: 51,
        dpi: 300,
        headHeightMin: 0.5,
        headHeightMax: 0.69,
        eyeLineFromBottom: 0.56,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "CN",
    name: "China",
    flag: "🇨🇳",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Chinese Passport",
        width: 33,
        height: 48,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "JP",
    name: "Japan",
    flag: "🇯🇵",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Japanese Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "KR",
    name: "South Korea",
    flag: "🇰🇷",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Korean Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "TH",
    name: "Thailand",
    flag: "🇹🇭",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Thai Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "PH",
    name: "Philippines",
    flag: "🇵🇭",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Philippine Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "ID",
    name: "Indonesia",
    flag: "🇮🇩",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Indonesian Passport",
        width: 30,
        height: 40,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#EF4444",
        bgColors: ["#EF4444"],
      },
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    flag: "\u{1F1F8}\u{1F1EC}",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Singapore Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "MY",
    name: "Malaysia",
    flag: "\u{1F1F2}\u{1F1FE}",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Malaysian Passport",
        width: 35,
        height: 50,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "VN",
    name: "Vietnam",
    flag: "\u{1F1FB}\u{1F1F3}",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Vietnamese Passport",
        width: 40,
        height: 60,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "PK",
    name: "Pakistan",
    flag: "\u{1F1F5}\u{1F1F0}",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Pakistani Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF", "#BFDBFE"],
      },
    ],
  },
  {
    code: "BD",
    name: "Bangladesh",
    flag: "\u{1F1E7}\u{1F1E9}",
    region: "asia",
    documents: [
      {
        type: "passport",
        label: "Bangladeshi Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  // Oceania
  {
    code: "AU",
    name: "Australia",
    flag: "🇦🇺",
    region: "oceania",
    documents: [
      {
        type: "passport",
        label: "Australian Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "NZ",
    name: "New Zealand",
    flag: "\u{1F1F3}\u{1F1FF}",
    region: "oceania",
    documents: [
      {
        type: "passport",
        label: "New Zealand Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  // Middle East
  {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    region: "middle-east",
    documents: [
      {
        type: "passport",
        label: "Saudi Passport",
        width: 40,
        height: 60,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    flag: "\u{1F1E6}\u{1F1EA}",
    region: "middle-east",
    documents: [
      {
        type: "passport",
        label: "UAE Passport",
        width: 43,
        height: 55,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  // Africa
  {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    region: "africa",
    documents: [
      {
        type: "passport",
        label: "Nigerian Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "EG",
    name: "Egypt",
    flag: "\u{1F1EA}\u{1F1EC}",
    region: "africa",
    documents: [
      {
        type: "passport",
        label: "Egyptian Passport",
        width: 40,
        height: 60,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    flag: "\u{1F1FF}\u{1F1E6}",
    region: "africa",
    documents: [
      {
        type: "passport",
        label: "South African Passport",
        width: 35,
        height: 45,
        dpi: 300,
        headHeightMin: 0.7,
        headHeightMax: 0.8,
        eyeLineFromBottom: 0.63,
        bgColor: "#FFFFFF",
        bgColors: ["#FFFFFF"],
      },
    ],
  },
];

export interface PrintLayout {
  id: string;
  label: string;
  width: number; // mm
  height: number; // mm
}

export const PRINT_LAYOUTS: PrintLayout[] = [
  { id: "4x6", label: "4x6 inch", width: 102, height: 152 },
  { id: "a4", label: "A4", width: 210, height: 297 },
  { id: "none", label: "None", width: 0, height: 0 },
];

export const APP_VERSION = "2.3.0";

/**
 * Tool IDs that require the Python sidecar (AI/ML tools).
 * Used by the frontend for progress/timeout behavior.
 */
export const PYTHON_SIDECAR_TOOLS = [
  "remove-background",
  "remove-gif-background",
  "upscale",
  "blur-faces",
  "erase-object",
  "ocr",
  "ocr-pdf",
  "colorize",
  "enhance-faces",
  "noise-removal",
  "smart-crop",
  "red-eye-removal",
  "restore-photo",
  "passport-photo",
  "transparency-fixer",
  "ai-canvas-expand",
  "transcribe-audio",
  "auto-subtitles",
  "background-replace",
  "blur-background",
] as const;

/**
 * X-File-Notes key meaning "this note applies to every file with a result".
 * Sent instead of one identical entry per file, so a batch where every file
 * carries the same note (Deep Enhance unavailable, say) keeps a small header
 * however many files it has (#1303).
 */
export const FILE_NOTES_ALL_FILES = "*";

/**
 * Allowed model identifiers for background removal.
 * Matches packages/ai/python/remove_bg.py ALLOWED_MODELS.
 */
export const BG_REMOVAL_MODELS = [
  "u2net",
  "isnet-general-use",
  "bria-rmbg",
  "birefnet-general-lite",
  "birefnet-portrait",
  "birefnet-general",
  "birefnet-matting",
  "birefnet-hr-matting",
] as const;

export type BgRemovalModel = (typeof BG_REMOVAL_MODELS)[number];
