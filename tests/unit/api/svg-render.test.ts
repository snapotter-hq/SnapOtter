import { isToolInputError, toolInputErrorCode } from "@snapotter/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderSvgToPng } from "../../../apps/api/src/lib/svg-render.js";

const svg = (rootAttrs: string, body = "") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${rootAttrs}>${body}</svg>`);

/**
 * Passes sanitizeSvg, but librsvg repaints the filtered rect once per <use>:
 * rendered in-process this takes minutes, and sharp's own timeout can't stop
 * it before the first region finishes (#5153).
 */
const expensiveSvg = svg(
  'width="2000" height="2000"',
  '<defs><filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>' +
    `<rect id="r" width="2000" height="2000" filter="url(#f)"/>${'<use href="#r"/>'.repeat(40)}`,
);

describe("renderSvgToPng", () => {
  it("renders at sharp's default 72 DPI when no density is given", async () => {
    const png = await renderSvgToPng(
      svg('width="100" height="50"', '<rect width="100" height="50"/>'),
    );
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 100, 50]);
  });

  it("bakes the requested density into the size and keeps it on the PNG", async () => {
    const png = await renderSvgToPng(svg('width="72pt" height="36pt"'), { density: 144 });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.density]).toEqual([144, 72, 144]);
  });

  it("kills a render that outlives the deadline and answers SVG_TOO_COMPLEX", async () => {
    const err = await renderSvgToPng(expensiveSvg, { deadlineMs: 500 }).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect(toolInputErrorCode(err)).toBe("SVG_TOO_COMPLEX");
    expect((err as Error).message).toMatch(/took longer than 1s to render/);
  });

  it("kills the render when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = renderSvgToPng(expensiveSvg, { signal: controller.signal, deadlineMs: 0 });
    controller.abort(new Error("caller went away"));
    await expect(pending).rejects.toThrow("caller went away");
  });

  it("rethrows sharp's own message for a render failure", async () => {
    const err = await renderSvgToPng(Buffer.from("<svg")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isToolInputError(err)).toBe(false);
    expect((err as Error).message).toMatch(/svg|unsupported|load/i);
  });

  it("applies the pixel limit inside the child", async () => {
    const err = await renderSvgToPng(svg('width="1000" height="1000"'), { maxPixels: 1000 }).catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toMatch(/pixel limit/i);
  });
});
