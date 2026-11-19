import sharp, { type Sharp } from "sharp";

/**
 * Size of each root length unit in sharp's density-72 user space, where one
 * px and one pt are both 1/72 inch.
 */
const UNITS_AT_72_DPI: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 1,
  pc: 12,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
};

// Unambiguous on purpose: digits can only split at the "." and the exponent,
// so a hostile value cannot make the match backtrack. Values longer than
// MAX_LENGTH_CHARS are refused before matching.
const LENGTH_PATTERN = /^(\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(px|pt|pc|in|cm|mm)?$/;
const MAX_LENGTH_CHARS = 64;

/** Parse a root width or height into density-72 px, or null for %, em and the like. */
function lengthAt72Dpi(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length > MAX_LENGTH_CHARS) return null;
  const match = LENGTH_PATTERN.exec(trimmed);
  if (!match) return null;
  const length = Number(match[1]) * (UNITS_AT_72_DPI[match[2] ?? ""] ?? Number.NaN);
  return Number.isFinite(length) && length > 0 ? length : null;
}

/** One quoted attribute, matched only where the previous one ended. */
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

interface AttributeValue {
  value: string;
  /** Span of the value inside the tag, quotes excluded. */
  start: number;
  end: number;
}

/**
 * Read the attributes of a root tag (without its closing `>`) in order, so a
 * `width=` inside another attribute's value is never mistaken for one. Returns
 * null when the tag holds anything but quoted attributes and an optional `/`.
 */
function readAttributes(tag: string): Map<string, AttributeValue> | null {
  const attributes = new Map<string, AttributeValue>();
  let pos = "<svg".length;
  for (;;) {
    ATTRIBUTE.lastIndex = pos;
    const match = ATTRIBUTE.exec(tag);
    if (!match) break;
    pos = ATTRIBUTE.lastIndex;
    const value = match[2] ?? match[3];
    if (!attributes.has(match[1])) {
      attributes.set(match[1], { value, start: pos - 1 - value.length, end: pos - 1 });
    }
  }
  const rest = tag.slice(pos).trim();
  return rest === "" || rest === "/" ? attributes : null;
}

const SVG_OPEN = /^<svg[\s/>]/;

/**
 * Index of the root `<svg` tag, skipping the XML declaration, processing
 * instructions, comments and DOCTYPE that may precede it, or -1 when the first
 * element is something else (including a namespace-prefixed `<svg:svg>`).
 */
function rootTagStart(text: string): number {
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    let end: number;
    if (text.startsWith("<?", pos)) {
      end = text.indexOf("?>", pos);
      if (end !== -1) end += 2;
    } else if (text.startsWith("<!--", pos)) {
      end = text.indexOf("-->", pos);
      if (end !== -1) end += 3;
    } else if (text.startsWith("<!DOCTYPE", pos)) {
      end = text.indexOf(">", pos);
      const subset = text.indexOf("[", pos);
      if (subset !== -1 && subset < end) {
        const subsetEnd = text.indexOf("]", subset);
        end = subsetEnd === -1 ? -1 : text.indexOf(">", subsetEnd);
      }
      if (end !== -1) end += 1;
    } else {
      break;
    }
    if (end === -1) return -1;
    pos = end;
  }
  return SVG_OPEN.test(text.slice(pos, pos + 5)) ? pos : -1;
}

function formatLength(n: number): string {
  return String(Number(n.toPrecision(12)));
}

/**
 * Bake `density` into an SVG's root width and height so it can be rendered
 * at density 72.
 *
 * libvips hands sharp's density to librsvg as its DPI and then scales the
 * render by density/72 again, so physical units (pt, in, mm, cm, pc) grow by
 * (density/72)^2: a 640pt SVG at 300 DPI came out 11111 px wide instead of
 * 2667 (#4423). At density 72 the two scales cancel, so the root is resized
 * to the target pixel size instead, with a viewBox added when missing so the
 * drawing scales with it. Roots sized in %, em or not at all are returned
 * untouched with the caller's density.
 */
export function bakeSvgDensity(svg: Buffer, density: number): { buffer: Buffer; density: number } {
  const unchanged = { buffer: svg, density };
  const text = svg.toString("utf-8");
  const start = rootTagStart(text);
  if (start === -1) return unchanged;
  const tagEnd = text.indexOf(">", start);
  if (tagEnd === -1) return unchanged;
  const tag = text.slice(start, tagEnd);

  const attributes = readAttributes(tag);
  const widthAttr = attributes?.get("width");
  const heightAttr = attributes?.get("height");
  if (!attributes || !widthAttr || !heightAttr) return unchanged;
  const width = lengthAt72Dpi(widthAttr.value);
  const height = lengthAt72Dpi(heightAttr.value);
  if (width === null || height === null) return unchanged;
  const scale = density / 72;
  if (!Number.isFinite(width * scale) || !Number.isFinite(height * scale)) return unchanged;

  const [first, second] = [
    { span: widthAttr, text: formatLength(width * scale) },
    { span: heightAttr, text: formatLength(height * scale) },
  ].sort((a, b) => a.span.start - b.span.start);
  let newTag =
    tag.slice(0, first.span.start) +
    first.text +
    tag.slice(first.span.end, second.span.start) +
    second.text +
    tag.slice(second.span.end);
  if (!attributes.has("viewBox")) {
    newTag = `<svg viewBox="0 0 ${formatLength(width)} ${formatLength(height)}"${newTag.slice(4)}`;
  }

  return {
    buffer: Buffer.from(text.slice(0, start) + newTag + text.slice(tagEnd), "utf-8"),
    density: 72,
  };
}

/** Open an SVG with sharp so it rasterizes at `density` pixels per inch. */
export function openSvgAtDensity(svg: Buffer, density: number): Sharp {
  const baked = bakeSvgDensity(svg, density);
  const image = sharp(baked.buffer, { density: baked.density });
  // Rendering at 72 would tag PNG and TIFF output as 72 DPI; keep the requested value.
  return baked.density === density ? image : image.withDensity(density);
}
