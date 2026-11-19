import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  renderTextOverlays,
  type TextOverlayLayout,
  textBlockOrigin,
} from "../../../apps/api/src/lib/text-overlay-render.js";

const LONG_TEXT = "This caption is much too long to fit on one line of the image";

const base: TextOverlayLayout = {
  text: "Hi",
  fontSize: 48,
  color: "#FFFFFF",
  position: "bottom",
  x: 50,
  y: 50,
  wrap: true,
  maxWidth: 90,
  backgroundBox: false,
  backgroundColor: "#000000",
  shadow: false,
};

/** Renders white text on a black canvas and returns the bounding box of the lit pixels. */
async function litBounds(layout: TextOverlayLayout, width: number, height: number) {
  const overlays = await renderTextOverlays(layout, { width, height });
  const { data, info } = await sharp({
    create: { width, height, channels: 3, background: "#000000" },
  })
    .composite(overlays)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * info.channels] > 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

describe("renderTextOverlays wrapping", () => {
  it("wraps long text inside the max width instead of running off the edges", async () => {
    const b = await litBounds({ ...base, text: LONG_TEXT }, 400, 400);
    expect(b.minX).toBeGreaterThanOrEqual(20);
    expect(b.maxX).toBeLessThanOrEqual(380);
    // More than one line: taller than a single 48px line.
    expect(b.maxY - b.minY).toBeGreaterThan(96);
  });

  it("narrows the lines when maxWidth shrinks", async () => {
    const wide = await litBounds({ ...base, text: LONG_TEXT, maxWidth: 90 }, 400, 600);
    const narrow = await litBounds({ ...base, text: LONG_TEXT, maxWidth: 40 }, 400, 600);
    expect(narrow.maxX - narrow.minX).toBeLessThanOrEqual(160);
    expect(narrow.maxY - narrow.minY).toBeGreaterThan(wide.maxY - wide.minY);
  });

  it("keeps the old single line, clipped at both edges, when wrap is off", async () => {
    const b = await litBounds({ ...base, text: LONG_TEXT, wrap: false }, 400, 300);
    // The edge column can land in a word gap, and where depends on the host's
    // sans-serif font, so only require the line to run past the 90% wrap box.
    expect(b.minX).toBeLessThan(20);
    expect(b.maxX).toBeGreaterThan(380);
    expect(b.maxY - b.minY).toBeLessThan(96);
  });

  it("composites onto a 1x1 image", async () => {
    const overlays = await renderTextOverlays(
      { ...base, text: LONG_TEXT, shadow: true, backgroundBox: true },
      { width: 1, height: 1 },
    );
    const out = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000000" } })
      .composite(overlays)
      .png()
      .toBuffer();
    expect((await sharp(out).metadata()).width).toBe(1);
  });

  it.each([" ", "\n", "\u200b"])("draws nothing for invisible text %j", async (text) => {
    const overlays = await renderTextOverlays(
      { ...base, text, shadow: true, backgroundBox: true },
      { width: 100, height: 100 },
    );
    expect(overlays).toEqual([]);
  });

  it("turns text too big for Cairo into a 400", async () => {
    await expect(
      renderTextOverlays(
        { ...base, text: "W".repeat(500), fontSize: 100, wrap: false },
        { width: 200, height: 200 },
      ),
    ).rejects.toMatchObject({ name: "InputValidationError", statusCode: 400 });
  });
  it("renders shadow and background box layers that fit the canvas", async () => {
    const canvas = { width: 300, height: 200 };
    const overlays = await renderTextOverlays(
      { ...base, text: LONG_TEXT, shadow: true, backgroundBox: true },
      canvas,
    );
    expect(overlays).toHaveLength(3);
    const out = await sharp({ create: { ...canvas, channels: 3, background: "#808080" } })
      .composite(overlays)
      .png()
      .toBuffer();
    expect((await sharp(out).metadata()).width).toBe(300);
  });
});

describe("textBlockOrigin", () => {
  const canvas = { width: 1000, height: 500 };
  const block = { width: 200, height: 100 };

  it("keeps the three presets centred horizontally", () => {
    for (const position of ["top", "center", "bottom"] as const) {
      expect(textBlockOrigin({ ...base, position }, block, canvas).left).toBe(400);
    }
    expect(textBlockOrigin({ ...base, position: "top" }, block, canvas).top).toBe(48);
    expect(textBlockOrigin({ ...base, position: "center" }, block, canvas).top).toBe(200);
    expect(textBlockOrigin({ ...base, position: "bottom" }, block, canvas).top).toBe(352);
  });

  it("centres a custom block on x, y percentages", () => {
    expect(textBlockOrigin({ ...base, position: "custom", x: 30, y: 40 }, block, canvas)).toEqual({
      left: 200,
      top: 150,
    });
  });

  it("keeps a custom block inside the image near an edge", () => {
    expect(textBlockOrigin({ ...base, position: "custom", x: 0, y: 100 }, block, canvas)).toEqual({
      left: 0,
      top: 400,
    });
  });

  it("ignores x and y for the presets", () => {
    expect(textBlockOrigin({ ...base, position: "center", x: 0, y: 0 }, block, canvas)).toEqual({
      left: 400,
      top: 200,
    });
  });
});

describe("renderTextOverlays custom position", () => {
  it("draws the text around the requested point", async () => {
    const b = await litBounds({ ...base, position: "custom", x: 25, y: 25 }, 400, 400);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    expect(Math.abs(cx - 100)).toBeLessThan(10);
    expect(Math.abs(cy - 100)).toBeLessThan(10);
  });
});
