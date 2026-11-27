import { isToolInputError, toolInputErrorCode } from "@snapotter/shared";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  rasterizeSanitizedSvg,
  renderSanitizedSvgOrReply,
} from "../../../apps/api/src/lib/image-input-prep.js";

const svg = (rootAttrs: string, body = "") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${rootAttrs}>${body}</svg>`);

const expensiveSvg = svg(
  'width="2000" height="2000"',
  '<defs><filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>' +
    `<rect id="r" width="2000" height="2000" filter="url(#f)"/>${'<use href="#r"/>'.repeat(40)}`,
);

function fakeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  return reply;
}

describe("rasterizeSanitizedSvg", () => {
  it("returns a PNG of the SVG at its natural size", async () => {
    const png = await rasterizeSanitizedSvg(
      svg('width="40" height="20"', '<rect width="40" height="20"/>'),
    );
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 40, 20]);
  });

  it("throws SVG_TOO_COMPLEX once the deadline passes", async () => {
    const err = await rasterizeSanitizedSvg(expensiveSvg, { deadlineMs: 500 }).catch(
      (e: unknown) => e,
    );
    expect(isToolInputError(err)).toBe(true);
    expect(toolInputErrorCode(err)).toBe("SVG_TOO_COMPLEX");
  });
});

describe("renderSanitizedSvgOrReply", () => {
  it("returns the rendered PNG and leaves the reply alone", async () => {
    const reply = fakeReply();
    const png = await renderSanitizedSvgOrReply(
      svg('width="10" height="10"', '<rect width="10" height="10"/>'),
      reply as never,
    );
    expect(png?.subarray(1, 4).toString()).toBe("PNG");
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("sends 400 with the code for a render that outlives the deadline", async () => {
    const reply = fakeReply();
    const out = await renderSanitizedSvgOrReply(expensiveSvg, reply as never, { deadlineMs: 500 });
    expect(out).toBeNull();
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: expect.stringMatching(/took longer than 1s to render/),
      code: "SVG_TOO_COMPLEX",
    });
  });

  it("sends 400 when the render trips the pixel limit", async () => {
    const reply = fakeReply();
    const out = await renderSanitizedSvgOrReply(svg('width="1000" height="1000"'), reply as never, {
      maxPixels: 1000,
    });
    expect(out).toBeNull();
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ code: "IMAGE_TOO_LARGE" }));
  });

  it("sends 422 for an SVG librsvg can't draw", async () => {
    const reply = fakeReply();
    const out = await renderSanitizedSvgOrReply(Buffer.from("<svg"), reply as never);
    expect(out).toBeNull();
    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to render SVG file", code: "IMAGE_UNDECODABLE" }),
    );
  });
});
