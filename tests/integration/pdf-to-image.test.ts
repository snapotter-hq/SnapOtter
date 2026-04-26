import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PDF_3PAGE = readFileSync(join(FIXTURES, "test-3page.pdf"));

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

describe("POST /api/v1/tools/pdf-to-image/info", () => {
  it("returns page count for a valid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/info",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pageCount).toBe(3);
  });

  it("returns 400 for invalid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/info",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when no file is provided", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "other", content: "hello" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/info",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/v1/tools/pdf-to-image/preview", () => {
  it("returns thumbnails for all pages", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/preview",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pageCount).toBe(3);
    expect(data.thumbnails).toHaveLength(3);
    expect(data.thumbnails[0].page).toBe(1);
    expect(data.thumbnails[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(data.thumbnails[0].width).toBeGreaterThan(0);
    expect(data.thumbnails[0].height).toBeGreaterThan(0);
  });

  it("returns 400 for invalid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/preview",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/v1/tools/pdf-to-image", () => {
  it("converts a single page to PNG with per-page URLs and ZIP", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].downloadUrl).toContain("page-1.png");
    expect(data.pages[0].size).toBeGreaterThan(0);
    expect(data.zipUrl).toContain("pdf-pages.zip");
    expect(data.pageCount).toBe(3);
    expect(data.selectedPages).toEqual([1]);
    expect(data.format).toBe("png");
  });

  it("converts a single page to JPG", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "jpg", dpi: 72, quality: 80, pages: "2" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages[0].downloadUrl).toContain("page-2.jpg");
  });

  it("converts multiple pages and returns JSON with ZIP URL", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1-3" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(3);
    expect(data.zipUrl).toContain("pdf-pages.zip");
    expect(data.zipSize).toBeGreaterThan(0);
    expect(data.selectedPages).toEqual([1, 2, 3]);
  });

  it("uses defaults when no settings provided", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(3);
    expect(data.format).toBe("png");
    expect(data.zipUrl).toBeTruthy();
  });

  it("applies grayscale color mode", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, colorMode: "grayscale", pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].size).toBeGreaterThan(0);
  });

  it("applies black and white color mode", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, colorMode: "bw", pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(1);
  });

  it("accepts custom DPI values", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 200, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(1);
  });

  it("rejects DPI below minimum", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 10, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid page range", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ pages: "5-10" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toMatch(/out of range/);
  });

  it("returns 400 for invalid PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      {
        name: "settings",
        content: JSON.stringify({ pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      { name: "settings", content: "not json" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toMatch(/JSON/);
  });

  it("returns 400 when no file is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ pages: "1" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("converts to WebP format", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "webp", dpi: 72, quality: 80, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages[0].downloadUrl).toContain("page-1.webp");
    expect(data.format).toBe("webp");
  });

  it("converts to AVIF format", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "avif", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages[0].downloadUrl).toContain("page-1.avif");
  });

  it("converts to TIFF format", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "tiff", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages[0].downloadUrl).toContain("page-1.tiff");
  });

  it("converts to GIF format", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "gif", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages[0].downloadUrl).toContain("page-1.gif");
  });

  it("converts specific comma-separated pages", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1,3" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pages).toHaveLength(2);
    expect(data.selectedPages).toEqual([1, 3]);
  });

  it("verifies images can be downloaded from per-page URLs", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    // Download the image
    const dlRes = await app.inject({
      method: "GET",
      url: data.pages[0].downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
  });

  it("verifies ZIP can be downloaded", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "png", dpi: 72, pages: "1-2" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    const zipRes = await app.inject({
      method: "GET",
      url: data.zipUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(zipRes.statusCode).toBe(200);
    // ZIP magic number: PK (0x50 0x4B)
    expect(zipRes.rawPayload[0]).toBe(0x50);
    expect(zipRes.rawPayload[1]).toBe(0x4b);
  });

  it("higher DPI produces larger images", async () => {
    const makePdfReq = (dpi: number) =>
      createMultipartPayload([
        {
          name: "file",
          filename: "test.pdf",
          contentType: "application/pdf",
          content: PDF_3PAGE,
        },
        {
          name: "settings",
          content: JSON.stringify({ format: "png", dpi, pages: "1" }),
        },
      ]);

    const { body: body72, contentType: ct72 } = makePdfReq(72);
    const { body: body300, contentType: ct300 } = makePdfReq(300);

    const res72 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body: body72,
      headers: { "content-type": ct72, authorization: `Bearer ${adminToken}` },
    });
    const res300 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body: body300,
      headers: { "content-type": ct300, authorization: `Bearer ${adminToken}` },
    });

    expect(res72.statusCode).toBe(200);
    expect(res300.statusCode).toBe(200);

    const data72 = JSON.parse(res72.body);
    const data300 = JSON.parse(res300.body);
    expect(data300.pages[0].size).toBeGreaterThan(data72.pages[0].size);
  });

  it("returns 400 for reversed page range (start > end)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ pages: "3-1" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toMatch(/start exceeds end/);
  });

  it("returns 400 for page number 0", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ pages: "0" }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings (DPI above max)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF_3PAGE,
      },
      {
        name: "settings",
        content: JSON.stringify({ dpi: 5000 }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Preview endpoint edge cases ────────────────────────────────
describe("Preview endpoint edge cases", () => {
  it("returns 400 when no file is provided to preview", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "other", content: "hello" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf-to-image/preview",
      body,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
