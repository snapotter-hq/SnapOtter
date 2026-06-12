import { existsSync } from "node:fs";

export interface FontRef {
  file: string;
  family: string;
}

const CANDIDATES: FontRef[] = [
  // Debian/Ubuntu container (fonts-dejavu-core, present since wave 2)
  { file: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", family: "DejaVu Sans" },
  // macOS development hosts
  { file: "/System/Library/Fonts/Supplemental/Arial.ttf", family: "Arial" },
  { file: "/System/Library/Fonts/Helvetica.ttc", family: "Helvetica" },
];

/**
 * Static ffmpeg builds carry no fontconfig database, so drawtext/libass
 * filters need an explicit font file. Env overrides first, then known
 * platform paths. Returns null when nothing exists (callers raise a clear
 * tool error instead of a cryptic ffmpeg one).
 */
export function resolveFontFile(): FontRef | null {
  const file = process.env.SNAPOTTER_FONT_FILE;
  if (file) {
    return { file, family: process.env.SNAPOTTER_FONT_FAMILY ?? "Sans" };
  }
  for (const c of CANDIDATES) {
    if (existsSync(c.file)) return c;
  }
  return null;
}
