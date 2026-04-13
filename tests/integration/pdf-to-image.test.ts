import { readFileSync } from "node:fs";
import { join } from "node:path";
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
});
