/**
 * Integration tests for the rounded-crop tool (/api/v1/tools/image/rounded-crop).
 *
 * Covers rounded-square and squircle masking, PNG output, corner alpha
 * transparency, straight-edge opacity (which proves it is a rounded square and
 * not a circle), the sharp-corner (radius 0) case, and border/background/size.
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

const PNG = readFixture(fixtures.image.base.png200); // 200x150

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

async function run(settings: Record<string, unknown>, file = PNG, filename = "test.png") {
  const contentType = filename.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const { body, contentType: ct } = createMultipartPayload([
    { name: "file", filename, contentType, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/rounded-crop",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": ct },
    body,
  });
}

async function download(url: string) {
  const dlRes = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return dlRes.rawPayload;
}

/** Alpha (0..255) of the pixel at (x, y) in a PNG buffer. */
async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Rounded Crop", () => {
  it("produces a rounded-square crop as a square PNG", async () => {
    const res = await run({});
    expect(res.statusCode).toBe(200);
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    // min(200, 150) = 150
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it("rounds the corners: a corner pixel is transparent", async () => {
    const res = await run({});
    const png = await download(JSON.parse(res.body).downloadUrl);
    expect(await alphaAt(png, 1, 1)).toBe(0);
  });

  it("keeps the center opaque", async () => {
    const res = await run({});
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    const cx = Math.floor((meta.width ?? 0) / 2);
    const cy = Math.floor((meta.height ?? 0) / 2);
    expect(await alphaAt(png, cx, cy)).toBe(255);
  });

  it("keeps straight edges opaque (rounded square, not a circle)", async () => {
    // Mid-top edge is on the straight run of a rounded square, so it stays
    // opaque. On a circle that same pixel would be clipped away.
    const res = await run({});
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    const midX = Math.floor((meta.width ?? 0) / 2);
    expect(await alphaAt(png, midX, 1)).toBe(255);
  });

  it("radius 0 gives a plain square with an opaque corner", async () => {
    const res = await run({ cornerRadius: 0 });
    expect(res.statusCode).toBe(200);
    const png = await download(JSON.parse(res.body).downloadUrl);
    expect(await alphaAt(png, 1, 1)).toBe(255);
  });

  it("squircle shape: transparent corner, opaque center", async () => {
    const res = await run({ shape: "squircle" });
    expect(res.statusCode).toBe(200);
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    const cx = Math.floor((meta.width ?? 0) / 2);
    const cy = Math.floor((meta.height ?? 0) / 2);
    expect(await alphaAt(png, 1, 1)).toBe(0);
    expect(await alphaAt(png, cx, cy)).toBe(255);
  });

  it("always outputs 4-channel PNG regardless of input format", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const res = await run({}, JPG, "test.jpg");
    expect(res.statusCode).toBe(200);
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4);
  });

  it("applies output size, border, and a solid background", async () => {
    const res = await run({
      zoom: 2,
      borderWidth: 10,
      borderColor: "#ff0000",
      background: "#0000ff",
      outputSize: 128,
    });
    expect(res.statusCode).toBe(200);
    const png = await download(JSON.parse(res.body).downloadUrl);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);
    // Solid background fills the corners, so the corner is opaque.
    expect(await alphaAt(png, 1, 1)).toBe(255);
  });

  it("rejects an unknown shape", async () => {
    const res = await run({ shape: "circle" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a corner radius above the allowed range", async () => {
    const res = await run({ cornerRadius: 80 });
    expect(res.statusCode).toBe(400);
  });
});
