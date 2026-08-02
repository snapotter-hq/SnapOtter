/**
 * PNG output must be lossless for tools that don't ask for lossy encoding
 * (issue #710).
 *
 * resolveOutputFormat used to hand every route a default quality of 95, and
 * Sharp reads `quality` on PNG as "quantise down to a palette". Every PNG that
 * passed through rotate, crop, resize, watermark and the rest of the factory
 * family was silently palette-reduced and dithered. Two routes carried their
 * own copy of the bug in branches that bypass resolveOutputFormat: image-pad
 * hardcoded quality 95 for transparent padding, and replace-color hardcoded
 * quality 100 when forcing PNG for transparency.
 *
 * Rotate and crop stand in for the shared-shape family because both have an
 * exact expected result: rotating 180 twice must return the original pixels,
 * and cropping must return exactly the pixels Sharp's own extract() produces.
 * The two bypass branches get their own oracles.
 *
 * Every input here carries more than 256 distinct colours. A palette PNG holds
 * at most 256, so palette encoding can never round-trip these losslessly; the
 * tests stay meaningful even if a future quantiser becomes exact on small
 * palettes. The flat-colour png200 fixture would pass all of this vacuously.
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

const SCENE = readFixture(fixtures.image.scene);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

/** The scene fixture with a 512-colour gradient strip composited on top. */
let busyPng: Buffer;
/** A 512x2 lossless TIFF whose 1024 pixels span 512 distinct colours. */
let gradientTiff: Buffer;

async function distinctColours(image: Buffer): Promise<number> {
  const raw = await sharp(image).ensureAlpha().raw().toBuffer();
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i += 4) {
    seen.add(`${raw[i]},${raw[i + 1]},${raw[i + 2]},${raw[i + 3]}`);
  }
  return seen.size;
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // 512x2 raw strip: row 0 is a 256-step grey ramp, row 1 a red-to-blue ramp.
  const strip = Buffer.alloc(512 * 2 * 3);
  for (let x = 0; x < 512; x++) {
    const v = x % 256;
    const top = x * 3;
    strip[top] = v;
    strip[top + 1] = v;
    strip[top + 2] = v;
    const bottom = (512 + x) * 3;
    strip[bottom] = v;
    strip[bottom + 1] = 0;
    strip[bottom + 2] = 255 - v;
  }
  const stripPng = await sharp(strip, { raw: { width: 512, height: 2, channels: 3 } })
    .png()
    .toBuffer();

  busyPng = await sharp(SCENE)
    .composite([{ input: stripPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
  gradientTiff = await sharp(strip, { raw: { width: 512, height: 2, channels: 3 } })
    .tiff({ compression: "lzw" })
    .toBuffer();

  // The whole file exists because >256 distinct colours make palette encoding
  // provably lossy. Fail loudly if a fixture change ever drops below that.
  expect(await distinctColours(busyPng)).toBeGreaterThan(256);
  expect(await distinctColours(gradientTiff)).toBeGreaterThan(256);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(
  toolId: string,
  settings: Record<string, unknown>,
  file?: { content: Buffer; filename: string; mime: string },
): Promise<Buffer> {
  const upload = file ?? { content: busyPng, filename: "busy.png", mime: "image/png" };
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: upload.filename,
      contentType: upload.mime,
      content: upload.content,
    },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  const res = await app.inject({
    method: "POST",
    url: `/api/v1/tools/image/${toolId}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(200);

  const dlRes = await app.inject({
    method: "GET",
    url: JSON.parse(res.body).downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return dlRes.rawPayload;
}

describe("PNG output stays lossless (#710)", () => {
  it("rotate 180 twice returns the original pixels", async () => {
    const once = await runTool("rotate", { angle: 180 });

    const roundTripped = await sharp(once).rotate(180).raw().toBuffer();
    const source = await sharp(busyPng).raw().toBuffer();

    expect(roundTripped.equals(source)).toBe(true);
  });

  it("crop returns exactly the extracted pixels", async () => {
    const region = { left: 100, top: 80, width: 200, height: 160 };
    const output = await runTool("crop", region);

    const outputPixels = await sharp(output).raw().toBuffer();
    const expected = await sharp(busyPng).extract(region).raw().toBuffer();

    expect(outputPixels.equals(expected)).toBe(true);
  });

  it("image-pad with a transparent background keeps the image pixels lossless", async () => {
    // 800x500 into a 1:1 canvas pads to 800x800 with the image at y=150.
    const output = await runTool("image-pad", { target: "1:1", background: "transparent" });

    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([800, 800]);

    const imageArea = await sharp(output)
      .extract({ left: 0, top: 150, width: 800, height: 500 })
      .removeAlpha()
      .raw()
      .toBuffer();
    const source = await sharp(busyPng).removeAlpha().raw().toBuffer();

    expect(imageArea.equals(source)).toBe(true);
  });

  it("replace-color's forced-PNG path stays lossless when nothing matches", async () => {
    // TIFF input has no alpha, so makeTransparent forces the PNG branch. The
    // red-to-blue ramp passes through exact red, but no pixel in either ramp
    // comes near pure green (the green channel differs by 255 everywhere
    // except the greys, which differ on red and blue instead), so the pixel
    // pass changes nothing and the encode is all that remains.
    const output = await runTool(
      "replace-color",
      { sourceColor: "#00FF00", makeTransparent: true, tolerance: 30 },
      { content: gradientTiff, filename: "gradient.tiff", mime: "image/tiff" },
    );

    const outputPixels = await sharp(output).ensureAlpha().raw().toBuffer();
    const source = await sharp(gradientTiff).ensureAlpha().raw().toBuffer();

    expect(outputPixels.equals(source)).toBe(true);
  });
});
