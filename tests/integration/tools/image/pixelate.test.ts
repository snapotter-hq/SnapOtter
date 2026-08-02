/**
 * Integration tests for the pixelate tool (/api/v1/tools/image/pixelate).
 *
 * Covers full-image pixelation, region pixelation, dimension preservation,
 * region bounds validation, region clamping, and schema validation.
 *
 * The pixel-level assertions use the scene fixture, not png200: png200 is a
 * single flat colour, so pixelating it is a genuine no-op and every oracle
 * built on it passes whether or not the tool does anything (issue #678).
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const SCENE = readFixture(fixtures.image.scene);
const ISOLATED = readFixture(fixtures.image.portrait.isolated);
const SCENE_W = 800;
const SCENE_H = 500;
const CHANNELS = 4;

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Run a fixture through the tool, returning the encoded file and its RGBA pixels. */
async function pixelate(content: Buffer, settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "input.png", contentType: "image/png", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/image/pixelate",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(200);

  const dlRes = await app.inject({
    method: "GET",
    url: JSON.parse(res.body).downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });

  const { data, info } = await sharp(dlRes.rawPayload)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = await sharp(content).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // The offset arithmetic below indexes both buffers with the same geometry, so
  // pin it. A reshaped fixture must fail loudly, not read past the end and
  // compare undefined to undefined, which counts as equal and passes.
  expect([info.width, info.height, info.channels]).toEqual([
    source.info.width,
    source.info.height,
    CHANNELS,
  ]);
  return { file: dlRes.rawPayload, pixels: data, source: source.data, width: info.width };
}

const offset = (width: number, x: number, y: number) => (y * width + x) * CHANNELS;

const samePixel = (a: Buffer, ai: number, b: Buffer, bi: number) =>
  a[ai] === b[bi] && a[ai + 1] === b[bi + 1] && a[ai + 2] === b[bi + 2] && a[ai + 3] === b[bi + 3];

/**
 * Names every blockSize-aligned block inside `box` that is not one flat colour.
 * The box must divide evenly, otherwise block borders drift off the grid and the
 * result says more about rounding than about the tool.
 */
function nonFlatBlocks(pixels: Buffer, width: number, box: Box, blockSize: number): string[] {
  expect([box.width % blockSize, box.height % blockSize]).toEqual([0, 0]);

  const uneven: string[] = [];
  for (let by = 0; by < box.height / blockSize; by++) {
    for (let bx = 0; bx < box.width / blockSize; bx++) {
      const originX = box.left + bx * blockSize;
      const originY = box.top + by * blockSize;
      const corner = offset(width, originX, originY);
      for (let y = originY; y < originY + blockSize; y++) {
        for (let x = originX; x < originX + blockSize; x++) {
          if (!samePixel(pixels, offset(width, x, y), pixels, corner)) {
            uneven.push(`(${bx},${by})`);
            y = originY + blockSize;
            break;
          }
        }
      }
    }
  }
  return uneven;
}

/** Coarse thumbnail, for comparing where content sits rather than its detail. */
const lowFrequency = (png: Buffer) =>
  sharp(png).resize(8, 5, { fit: "fill" }).removeAlpha().raw().toBuffer();

const maxDelta = (a: Buffer, b: Buffer) => {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
};

const WHOLE_SCENE: Box = { left: 0, top: 0, width: SCENE_W, height: SCENE_H };

describe("Pixelate", () => {
  it("flattens the image into uniform blocks", async () => {
    // 20 divides the 800x500 scene into an exact 40x25 grid, so block borders
    // land on known coordinates and no rounding slack is needed.
    const { pixels, source, width } = await pixelate(SCENE, { blockSize: 20 });

    // Guards the narrow case where the resize no-ops and the encode happens to
    // be lossless. The block check below is what catches a plain passthrough.
    expect(pixels.equals(source)).toBe(false);

    const uneven = nonFlatBlocks(pixels, width, WHOLE_SCENE, 20);
    expect(uneven.length, `blocks that are not one flat colour: ${uneven.slice(0, 10)}`).toBe(0);
  });

  it("scales the blocks with blockSize", async () => {
    // A coarser request has to produce coarser blocks. Asserting flatness on the
    // 50 grid pins the size from above; the 20 grid in the test above pins it
    // from below, so neither a hardcoded nor an ignored blockSize survives both.
    // 50 is used rather than 40 because it divides 500 as well as 800.
    const coarse = await pixelate(SCENE, { blockSize: 50 });
    const fine = await pixelate(SCENE, { blockSize: 20 });

    const uneven = nonFlatBlocks(coarse.pixels, coarse.width, WHOLE_SCENE, 50);
    expect(uneven.length, `blocks that are not one flat colour: ${uneven.slice(0, 10)}`).toBe(0);
    expect(coarse.pixels.equals(fine.pixels)).toBe(false);
  });

  it("keeps the picture in place when the block grid skews the aspect ratio", async () => {
    // 800/48 and 500/48 round to a 17x10 grid, whose 1.70 aspect does not match
    // the image's 1.60. This is the case that needs fit: "fill" on both resizes;
    // the default "cover" crops and shifts the picture instead, which no
    // dimension assertion can see because the output is still 800x500.
    const { file } = await pixelate(SCENE, { blockSize: 48 });

    const delta = maxDelta(await lowFrequency(SCENE), await lowFrequency(file));
    // Measured: 9 with fill, 66 with cover.
    expect(delta).toBeLessThan(20);
  });

  it("pixelates only the requested region", async () => {
    // 200x160 at blockSize 20 is an exact 10x8 grid inside the region.
    const region: Box = { left: 100, top: 80, width: 200, height: 160 };
    const { pixels, source, width } = await pixelate(SCENE, { blockSize: 20, region });

    const uneven = nonFlatBlocks(pixels, width, region, 20);
    expect(uneven.length, `blocks that are not one flat colour: ${uneven.slice(0, 10)}`).toBe(0);

    let changedInside = 0;
    let changedOutside = 0;
    for (let y = 0; y < SCENE_H; y++) {
      for (let x = 0; x < SCENE_W; x++) {
        const i = offset(width, x, y);
        if (samePixel(pixels, i, source, i)) continue;
        const inside =
          x >= region.left &&
          x < region.left + region.width &&
          y >= region.top &&
          y < region.top + region.height;
        if (inside) changedInside++;
        else changedOutside++;
      }
    }

    expect(changedOutside).toBe(0);
    expect(changedInside).toBeGreaterThan(0);
  });

  it("replaces a region of a transparent image instead of blending into it", async () => {
    // Compositing the mosaic with the default `over` blend lets the original
    // show through anywhere the block's averaged alpha is below 255, so a
    // part-transparent image keeps the detail the user asked to hide.
    const region: Box = { left: 0, top: 200, width: 400, height: 400 };
    const { pixels, width } = await pixelate(ISOLATED, { blockSize: 20, region });

    const uneven = nonFlatBlocks(pixels, width, region, 20);
    expect(uneven.length, `blocks still showing the original: ${uneven.slice(0, 10)}`).toBe(0);
  });

  it("pixelates entire image with default blockSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("preserves dimensions after pixelation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ blockSize: 20 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("pixelates a specific region", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          blockSize: 10,
          region: { left: 10, top: 10, width: 50, height: 50 },
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("clamps region that slightly exceeds image edges", async () => {
    // Region extends past right/bottom edge: left 180 + width 50 = 230 > 200
    // Backend should clamp width to 20 and height to 20, then succeed.
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          blockSize: 10,
          region: { left: 180, top: 130, width: 50, height: 50 },
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rejects region with origin outside image bounds", async () => {
    // left=200 is at/past the right edge of a 200px wide image
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          blockSize: 10,
          region: { left: 200, top: 0, width: 50, height: 50 },
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  it("rejects blockSize below minimum (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ blockSize: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/pixelate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
