import sharp, { type OverlayOptions } from "sharp";
import { InputValidationError } from "../modality/contract.js";

export type TextOverlayPosition = "top" | "center" | "bottom" | "custom";

export interface TextOverlayLayout {
  text: string;
  fontSize: number;
  color: string;
  position: TextOverlayPosition;
  /** Centre of the text block as a percentage of image width, used when position is "custom". */
  x: number;
  /** Centre of the text block as a percentage of image height, used when position is "custom". */
  y: number;
  wrap: boolean;
  /** Widest a wrapped line may get, as a percentage of image width. */
  maxWidth: number;
  backgroundBox: boolean;
  backgroundColor: string;
  shadow: boolean;
}

interface RenderedLayer {
  data: Buffer;
  width: number;
  height: number;
}

const SHADOW_OFFSET = 2;
const SHADOW_BLUR_SIGMA = 3;
// A Gaussian blur fades out by about three sigma, so pad that far or the shadow edge is cut flat.
const SHADOW_PAD = SHADOW_BLUR_SIGMA * 3;
const BACKGROUND_OPACITY = 0.7;
// Pango refuses text with nothing to draw, so a caption made only of these renders no layers.
const INVISIBLE_TEXT = /^[\s\u200b-\u200d\u2060\ufeff]*$/;

function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Pango lays the text out with real font metrics, so wrapping holds for any script
// and font without measuring glyphs ourselves. At 72 dpi one point is one pixel.
async function renderText(
  layout: TextOverlayLayout,
  spanAttrs: string,
  wrapWidth: number | undefined,
): Promise<RenderedLayer> {
  const rendered = await sharp({
    text: {
      text: `<span ${spanAttrs}>${escapeMarkup(layout.text)}</span>`,
      font: `sans-serif ${layout.fontSize}`,
      dpi: 72,
      rgba: true,
      width: wrapWidth,
      align: "centre",
      wrap: "word-char",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
    .catch((err: unknown) => {
      // Cairo caps a surface at 32767px a side. Long unwrapped text, or a big font
      // wrapped one glyph per line on a narrow image, goes past it.
      if (err instanceof Error && /too big/i.test(err.message)) {
        throw new InputValidationError(
          "The text is too large to render. Use a smaller font size or shorter text.",
        );
      }
      throw err;
    });
  return { data: rendered.data, width: rendered.info.width, height: rendered.info.height };
}

/** Keeps a block inside the canvas when it fits; a block bigger than the canvas keeps its start. */
function clampStart(start: number, size: number, total: number): number {
  if (size >= total) return start;
  return Math.min(Math.max(start, 0), total - size);
}

export function textBlockOrigin(
  layout: Pick<TextOverlayLayout, "position" | "x" | "y" | "fontSize">,
  block: { width: number; height: number },
  canvas: { width: number; height: number },
): { left: number; top: number } {
  if (layout.position === "custom") {
    const left = (layout.x / 100) * canvas.width - block.width / 2;
    const top = (layout.y / 100) * canvas.height - block.height / 2;
    return {
      left: Math.round(clampStart(left, block.width, canvas.width)),
      top: Math.round(clampStart(top, block.height, canvas.height)),
    };
  }
  const left = Math.round((canvas.width - block.width) / 2);
  const margin = layout.fontSize;
  switch (layout.position) {
    case "top":
      return { left, top: margin };
    case "center":
      return { left, top: Math.round((canvas.height - block.height) / 2) };
    default:
      return { left, top: canvas.height - margin - block.height };
  }
}

/**
 * sharp refuses an overlay that is bigger than the base or hangs off its edge,
 * so cut the layer down to the part that lands on the canvas.
 */
async function placeOnCanvas(
  layer: RenderedLayer,
  left: number,
  top: number,
  canvas: { width: number; height: number },
): Promise<OverlayOptions | null> {
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(canvas.width, left + layer.width);
  const y1 = Math.min(canvas.height, top + layer.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const fitsWhole =
    x0 === left && y0 === top && x1 - x0 === layer.width && y1 - y0 === layer.height;
  const input = fitsWhole
    ? layer.data
    : await sharp(layer.data)
        .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
        .png()
        .toBuffer();
  return { input, left: x0, top: y0 };
}

/** Builds the composite layers (background strip, shadow, text) for one frame of the given size. */
export async function renderTextOverlays(
  layout: TextOverlayLayout,
  canvas: { width: number; height: number },
): Promise<OverlayOptions[]> {
  if (INVISIBLE_TEXT.test(layout.text)) return [];
  const wrapWidth = layout.wrap
    ? Math.max(1, Math.round((canvas.width * layout.maxWidth) / 100))
    : undefined;
  const text = await renderText(layout, `foreground="${layout.color}"`, wrapWidth);
  const { left, top } = textBlockOrigin(layout, text, canvas);
  const layers: OverlayOptions[] = [];

  if (layout.backgroundBox) {
    const padY = Math.round(layout.fontSize * 0.4);
    const strip: RenderedLayer = {
      data: await sharp({
        create: {
          width: canvas.width,
          height: text.height + padY * 2,
          channels: 4,
          background: { ...hexToRgb(layout.backgroundColor), alpha: BACKGROUND_OPACITY },
        },
      })
        .png()
        .toBuffer(),
      width: canvas.width,
      height: text.height + padY * 2,
    };
    const placed = await placeOnCanvas(strip, 0, top - padY, canvas);
    if (placed) layers.push(placed);
  }

  if (layout.shadow) {
    const glyphs = await renderText(layout, `foreground="#000000" fgalpha="70%"`, wrapWidth);
    const shadow: RenderedLayer = {
      data: await sharp(glyphs.data)
        .extend({
          top: SHADOW_PAD,
          bottom: SHADOW_PAD,
          left: SHADOW_PAD,
          right: SHADOW_PAD,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .blur(SHADOW_BLUR_SIGMA)
        .png()
        .toBuffer(),
      width: glyphs.width + SHADOW_PAD * 2,
      height: glyphs.height + SHADOW_PAD * 2,
    };
    const placed = await placeOnCanvas(
      shadow,
      left + SHADOW_OFFSET - SHADOW_PAD,
      top + SHADOW_OFFSET - SHADOW_PAD,
      canvas,
    );
    if (placed) layers.push(placed);
  }

  const placedText = await placeOnCanvas(text, left, top, canvas);
  if (placedText) layers.push(placedText);
  return layers;
}
