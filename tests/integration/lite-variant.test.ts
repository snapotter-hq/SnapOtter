import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

describe("Lite variant", () => {
  let testApp: TestApp;
  let app: TestApp["app"];
  let adminToken: string;

  beforeAll(async () => {
    process.env.STIRLING_VARIANT = "lite";
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  }, 30_000);

  afterAll(async () => {
    delete process.env.STIRLING_VARIANT;
    await testApp.cleanup();
  }, 10_000);

  describe("GET /api/v1/settings", () => {
    it("includes variant and variantUnavailableTools", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.variant).toBe("lite");
      expect(body.variantUnavailableTools).toEqual([
        "remove-background",
        "upscale",
        "blur-faces",
        "erase-object",
        "ocr",
      ]);
    });
  });

  describe("AI tool routes return 501", () => {
    const aiTools = ["remove-background", "upscale", "blur-faces", "erase-object", "ocr"];

    for (const toolId of aiTools) {
      it(`POST /api/v1/tools/${toolId} returns 501`, async () => {
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/tools/${toolId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {},
        });

        expect(res.statusCode).toBe(501);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Not Available");
        expect(body.message).toContain("full image");
      });
    }
  });

  describe("Sharp tools still work in lite mode", () => {
    it("POST /api/v1/tools/info returns 200 with valid image", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const __dirname = join(fileURLToPath(import.meta.url), "..");
      const png = readFileSync(join(__dirname, "..", "fixtures", "test-200x150.png"));

      const boundary = "----TestBoundary";
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/info",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
