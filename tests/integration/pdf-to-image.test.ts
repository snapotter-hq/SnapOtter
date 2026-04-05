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

describe("POST /api/v1/tools/pdf-to-image", () => {
  it("converts a single page to PNG and returns a download URL", async () => {
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
    expect(data.downloadUrl).toContain("/api/v1/download/");
    expect(data.downloadUrl).toContain("page-1.png");
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
        content: JSON.stringify({ format: "jpg", dpi: 72, pages: "2" }),
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
    expect(data.downloadUrl).toContain("page-2.jpg");
  });

  it("returns a ZIP for multiple pages", async () => {
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
    // reply.hijack() bypasses Fastify's normal response handling, so
    // app.inject() returns statusCode 200 and the raw ZIP payload.
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBeGreaterThan(0);
    // ZIP files start with the PK magic bytes (0x50, 0x4B)
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
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
    // Default pages="all" means 3 pages, which triggers ZIP streaming
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBeGreaterThan(0);
    // Verify ZIP magic bytes
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
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
    // mupdf may attempt to repair the broken file, so the error can surface
    // during rendering rather than at open time, resulting in a 422.
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
