// apps/web/src/components/editor/common/font-loader.ts
//
// The editor text tool only offers fonts that render without any network
// access: widely available system font stacks, plus fonts this app serves
// itself. Remote font providers (Google Fonts and friends) are deliberately
// unsupported: the product makes no automatic third-party requests, and the
// served CSP blocks them anyway. To bundle a font later, put the woff2 under
// the app's own origin and add it to SELF_HOSTED_FONTS; nothing else changes.

const SYSTEM_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Palatino",
  "Courier New",
  "Impact",
  "Comic Sans MS",
] as const;

interface SelfHostedFont {
  family: string;
  /** Same-origin URL to a woff2 file. */
  url: string;
}

/** Fonts served from this origin. None are bundled today. */
const SELF_HOSTED_FONTS: SelfHostedFont[] = [];

const loadedFonts = new Set<string>();

export function isSystemFont(name: string): boolean {
  return (SYSTEM_FONTS as readonly string[]).includes(name);
}

export function getAllFonts(): { system: string[]; selfHosted: string[] } {
  return {
    system: [...SYSTEM_FONTS],
    selfHosted: SELF_HOSTED_FONTS.map((font) => font.family),
  };
}

/**
 * Make sure a font is ready for canvas rendering. System fonts need no
 * loading; self-hosted fonts are fetched from this origin via the FontFace
 * API. Unknown families (for example a font picked before remote loading was
 * removed) resolve immediately and fall back to the browser default when
 * drawn, so old documents keep rendering.
 */
export async function ensureFontLoaded(name: string): Promise<void> {
  if (isSystemFont(name) || loadedFonts.has(name)) return;

  const font = SELF_HOSTED_FONTS.find((candidate) => candidate.family === name);
  if (!font) return;

  try {
    const face = new FontFace(font.family, `url(${font.url})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    // Keep going with the browser fallback; don't retry endlessly.
  }
  loadedFonts.add(name);
}
