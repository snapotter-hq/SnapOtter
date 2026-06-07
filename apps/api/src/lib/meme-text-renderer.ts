import { readFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextBox {
  /** The text content to render */
  text: string;
  /** X position as percentage (0-100) of image width */
  x: number;
  /** Y position as percentage (0-100) of image height */
  y: number;
  /** Width as percentage (0-100) of image width */
  width: number;
  /** Height as percentage (0-100) of image height */
  height: number;
}

export interface MemeTextOptions {
  imageWidth: number;
  imageHeight: number;
  textBoxes: TextBox[];
  fontFamily: string;
  fontSize?: number;
  textColor: string;
  strokeColor: string;
  textAlign: "left" | "center" | "right";
  allCaps: boolean;
}

// ---------------------------------------------------------------------------
// Font loading & caching
// ---------------------------------------------------------------------------

const FONT_DIR = join(import.meta.dirname, "../../static/fonts");

const FONT_MAP: Record<string, string> = {
  anton: "Anton-Regular.ttf",
  "arial-black": "ArchivoBlack-Regular.ttf",
  "comic-sans": "ComicNeue-Bold.ttf",
  montserrat: "Montserrat-Black.ttf",
  "bebas-neue": "BebasNeue-Regular.ttf",
  "permanent-marker": "PermanentMarker-Regular.ttf",
  roboto: "Roboto-Black.ttf",
};

const fontCache = new Map<string, opentype.Font>();

/**
 * Load a font by family key. Unknown fonts fall back to Anton.
 * Results are cached so repeated calls return the same instance.
 */
export function loadFont(family: string): opentype.Font {
  const filename = FONT_MAP[family] ?? FONT_MAP.anton;

  const cached = fontCache.get(filename);
  if (cached) return cached;

  const buf = readFileSync(join(FONT_DIR, filename));
  let font: opentype.Font;
  try {
    font = opentype.parse(buf.buffer as ArrayBuffer);
  } catch {
    if (filename !== FONT_MAP.anton) {
      return loadFont("anton");
    }
    throw new Error(`Failed to parse font: ${filename}`);
  }
  fontCache.set(filename, font);
  return font;
}

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

/**
 * Measure the advance width of a string in the given font at the given size.
 */
export function measureText(text: string, fontFamily: string, fontSize: number): number {
  if (text === "") return 0;
  const font = loadFont(fontFamily);
  return font.getAdvanceWidth(text, fontSize);
}

// ---------------------------------------------------------------------------
// Word wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap text into lines that fit within maxWidth pixels.
 * Words that individually exceed maxWidth are placed on their own line.
 */
export function wrapText(
  text: string,
  fontFamily: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  if (text === "") return [""];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${currentLine} ${words[i]}`;
    const width = measureText(candidate, fontFamily, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  return lines;
}

// ---------------------------------------------------------------------------
// Auto-sizing
// ---------------------------------------------------------------------------

const MIN_FONT_SIZE = 8;
const DEFAULT_MAX_FONT_SIZE = 200;
const LINE_HEIGHT_FACTOR = 1.2;

/**
 * Binary search for the largest font size where the text wraps to fit
 * within boxWidth x boxHeight pixels.
 */
export function autoSizeFontToFit(
  text: string,
  fontFamily: string,
  boxWidth: number,
  boxHeight: number,
  maxFontSize = DEFAULT_MAX_FONT_SIZE,
): number {
  const effectiveMax = Math.min(maxFontSize, Math.floor(boxHeight / 5), Math.floor(boxWidth / 8));
  let lo = MIN_FONT_SIZE;
  let hi = Math.max(MIN_FONT_SIZE, effectiveMax);
  let best = MIN_FONT_SIZE;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = wrapText(text, fontFamily, mid, boxWidth);
    const totalHeight = lines.length * mid * LINE_HEIGHT_FACTOR;
    const maxLineWidth = Math.max(...lines.map((l) => measureText(l, fontFamily, mid)));

    if (totalHeight <= boxHeight && maxLineWidth <= boxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

/** Escape XML special characters in attribute values. */
function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render meme text boxes to an SVG buffer using opentype.js path conversion.
 * The SVG uses <path> elements (not <text>) so no system fonts are needed
 * when Sharp/librsvg rasterises it.
 */
export function renderMemeTextSvg(opts: MemeTextOptions): Buffer {
  const {
    imageWidth,
    imageHeight,
    textBoxes,
    fontFamily,
    fontSize: fixedFontSize,
    textColor,
    strokeColor,
    textAlign,
    allCaps,
  } = opts;

  const font = loadFont(fontFamily);
  const paths: string[] = [];

  for (const box of textBoxes) {
    let text = box.text;
    if (!text || text.trim() === "") continue;
    if (allCaps) text = text.toUpperCase();

    // Convert percentage coords to pixels
    const bx = (box.x / 100) * imageWidth;
    const by = (box.y / 100) * imageHeight;
    const bw = (box.width / 100) * imageWidth;
    const bh = (box.height / 100) * imageHeight;

    const pad = Math.max(8, Math.round(bw * 0.05));
    const innerW = bw - pad * 2;
    const innerH = bh - pad * 2;
    const fontSize = fixedFontSize ?? autoSizeFontToFit(text, fontFamily, innerW, innerH);
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    const lines = wrapText(text, fontFamily, fontSize, innerW);
    const strokeWidth = Math.max(1, Math.round(fontSize * 0.04));

    const fillAttr = escapeXmlAttr(textColor);
    const strokeAttr = escapeXmlAttr(strokeColor);

    const totalTextHeight = lines.length * lineHeight;
    const yOffset = by + pad + (innerH - totalTextHeight) / 2 + fontSize * 0.85;
    const innerX = bx + pad;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const lineWidth = font.getAdvanceWidth(line, fontSize);

      let x: number;
      if (textAlign === "left") {
        x = innerX;
      } else if (textAlign === "right") {
        x = innerX + innerW - lineWidth;
      } else {
        x = innerX + (innerW - lineWidth) / 2;
      }

      const y = yOffset + i * lineHeight;

      let d: string;
      try {
        const pathObj = font.getPath(line, x, y, fontSize);
        d = pathObj.toPathData(2);
      } catch {
        // Some fonts have unsupported GSUB features in opentype.js v2.
        // Fall back to Anton for the failing line.
        const fallback = loadFont("anton");
        const pathObj = fallback.getPath(line, x, y, fontSize);
        d = pathObj.toPathData(2);
      }

      paths.push(
        `<path d="${d}" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round"/>`,
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
    ...paths,
    "</svg>",
  ].join("\n");

  return Buffer.from(svg, "utf-8");
}
