import { z } from "zod";

export const SHADOW_PRESETS = {
  none: { blur: 0, offsetX: 0, offsetY: 0, color: "#000000", opacity: 0 },
  subtle: { blur: 20, offsetX: 0, offsetY: 4, color: "#000000", opacity: 20 },
  medium: { blur: 40, offsetX: 0, offsetY: 10, color: "#000000", opacity: 35 },
  dramatic: { blur: 80, offsetX: 0, offsetY: 20, color: "#000000", opacity: 50 },
} as const;

export const SOCIAL_PRESETS = {
  none: null,
  twitter: { width: 1600, height: 900 },
  linkedin: { width: 1200, height: 627 },
  "instagram-square": { width: 1080, height: 1080 },
  "instagram-story": { width: 1080, height: 1920 },
  facebook: { width: 1200, height: 630 },
  producthunt: { width: 1270, height: 760 },
} as const;

export const DEVICE_FRAMES = new Set([
  "iphone",
  "iphone-dark",
  "macbook",
  "macbook-dark",
  "ipad",
  "ipad-dark",
]);

export const SVG_FRAMES = new Set([
  "macos-light",
  "macos-dark",
  "windows-light",
  "windows-dark",
  "browser-light",
  "browser-dark",
]);

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const gradientStopSchema = z.object({
  color: hexColorSchema,
  position: z.number().min(0).max(100),
});

export const settingsSchema = z.object({
  backgroundType: z
    .enum(["solid", "linear-gradient", "radial-gradient", "image", "transparent"])
    .default("linear-gradient"),
  backgroundColor: hexColorSchema.default("#667eea"),
  gradientStops: z
    .array(gradientStopSchema)
    .min(2)
    .default([
      { color: "#667eea", position: 0 },
      { color: "#764ba2", position: 100 },
    ]),
  gradientAngle: z.number().min(0).max(360).default(135),
  padding: z.number().int().min(0).max(256).default(64),
  borderRadius: z.number().int().min(0).max(64).default(12),
  shadowPreset: z.enum(["none", "subtle", "medium", "dramatic", "custom"]).default("subtle"),
  shadowBlur: z.number().min(0).max(100).default(20),
  shadowOffsetX: z.number().int().min(-50).max(50).default(0),
  shadowOffsetY: z.number().int().min(-50).max(50).default(10),
  shadowColor: hexColorSchema.default("#000000"),
  shadowOpacity: z.number().min(0).max(100).default(30),
  frame: z
    .enum([
      "none",
      "macos-light",
      "macos-dark",
      "windows-light",
      "windows-dark",
      "browser-light",
      "browser-dark",
      "iphone",
      "iphone-dark",
      "macbook",
      "macbook-dark",
      "ipad",
      "ipad-dark",
    ])
    .default("none"),
  frameTitle: z.string().optional(),
  socialPreset: z
    .enum([
      "none",
      "twitter",
      "linkedin",
      "instagram-square",
      "instagram-story",
      "facebook",
      "producthunt",
    ])
    .default("none"),
  watermarkText: z.string().optional(),
  watermarkPosition: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    .default("bottom-right"),
  watermarkOpacity: z.number().min(0).max(100).default(50),
  outputFormat: z.enum(["png", "jpeg", "webp"]).default("png"),
});

export type BeautifySettings = z.infer<typeof settingsSchema>;

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
