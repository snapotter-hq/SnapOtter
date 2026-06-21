/**
 * Integration tests for the ocr-pdf tool (/api/v1/tools/pdf/ocr-pdf).
 *
 * The OCR bundle (PaddleOCR / Tesseract) is 3-4 GB and not installed locally
 * or in any verification environment this wave. The 501 gate is always hit.
 * The bundle-gated happy path lives in a skipped describe for future
 * in-container-after-install runs. The 501 contract + python-side conventions
 * carry the verification.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);

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

describe("ocr-pdf", () => {
  // -- 501 gate (always fires locally: OCR bundle never installed) --

  it("returns 501 FEATURE_NOT_INSTALLED when bundle is absent", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("ocr");
    expect(json.featureName).toBe("OCR");
    expect(json.estimatedSize).toBeDefined();
  });

  // -- Auth gate --

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Validation (501 fires before settings parse, so bad quality also 501s) --

  it("returns 501 even with invalid quality (gate fires first)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      {
        name: "settings",
        content: JSON.stringify({ quality: "ultra" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // 501 because the bundle gate fires before settings validation
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
  });

  // -- Bundle-gated happy path (skipped: OCR bundle is 3-4 GB) --

  // The OCR bundle is not installed in any verification environment this wave.
  // These tests exist for future in-container runs after bundle install.
  // The 501 contract + python-side conventions carry the verification.
  describe.skip("with ocr bundle installed", () => {
    it("extracts text from PDF (202 + async)", async () => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "test-3page.pdf",
          contentType: "application/pdf",
          content: PDF,
        },
        {
          name: "settings",
          content: JSON.stringify({ quality: "fast", pages: "1" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/pdf/ocr-pdf",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(202);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.async).toBe(true);
    }, 300_000);
  });
});
