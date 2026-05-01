/**
 * Cross-format matrix integration test for AI tools.
 *
 * Tests 13 AI tools x 17 input formats to verify:
 *   - No tool returns 500 (server crash) for any format
 *   - Validation layer works: missing file -> 400, bad settings -> 400
 *   - Auth enforcement: unauthenticated -> 401
 *   - Format acceptance/rejection is graceful (200, 202, 400, 422, or 501)
 *
 * The Python AI sidecar is NOT running during integration tests.
 * AI tools will return 501 (FEATURE_NOT_INSTALLED) or 202 (accepted for
 * async processing). This is expected -- we are testing the validation
 * layer, NOT that AI processing succeeds.
 *
 * Some tools (smart-crop, content-aware-resize) use the factory pattern
 * or process synchronously and may return 200 or 422 depending on whether
 * the Go/Python binary is available.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FORMATS_DIR = join(__dirname, "..", "fixtures", "formats");

// ---------------------------------------------------------------------------
// Format sample definitions (matches format-matrix.test.ts)
// ---------------------------------------------------------------------------
interface FormatSample {
  name: string;
  file: string;
  mime: string;
  needsCliDecoder: boolean;
  needsHeifDecoder: boolean;
  mayFailValidation: boolean;
}

const FORMAT_SAMPLES: FormatSample[] = [
  {
    name: "JPEG",
    file: "sample.jpg",
    mime: "image/jpeg",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PNG",
    file: "sample.png",
    mime: "image/png",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "WebP",
    file: "sample.webp",
    mime: "image/webp",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "GIF",
    file: "sample.gif",
    mime: "image/gif",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "AVIF",
    file: "sample.avif",
    mime: "image/avif",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "TIFF",
    file: "sample.tiff",
    mime: "image/tiff",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "BMP",
    file: "sample.bmp",
    mime: "image/bmp",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: true,
  },
  {
    name: "HEIC",
    file: "sample.heic",
    mime: "image/heic",
    needsCliDecoder: false,
    needsHeifDecoder: true,
    mayFailValidation: false,
  },
  {
    name: "HEIF",
    file: "sample.heif",
    mime: "image/heif",
    needsCliDecoder: false,
    needsHeifDecoder: true,
    mayFailValidation: false,
  },
  {
    name: "SVG",
    file: "sample.svg",
    mime: "image/svg+xml",
    needsCliDecoder: false,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "ICO",
    file: "sample.ico",
    mime: "image/x-icon",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "PSD",
    file: "sample.psd",
    mime: "image/vnd.adobe.photoshop",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "EXR",
    file: "sample.exr",
    mime: "image/x-exr",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "HDR",
    file: "sample.hdr",
    mime: "image/vnd.radiance",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "TGA",
    file: "sample.tga",
    mime: "image/x-tga",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "DNG",
    file: "sample.dng",
    mime: "image/x-adobe-dng",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: false,
  },
  {
    name: "JXL",
    file: "sample.jxl",
    mime: "image/jxl",
    needsCliDecoder: true,
    needsHeifDecoder: false,
    mayFailValidation: true,
  },
];

// ---------------------------------------------------------------------------
// AI tool definitions
// ---------------------------------------------------------------------------
interface AiToolDef {
  /** Tool route name (maps to /api/v1/tools/<id>) */
  id: string;
  /** Display name for test output */
  label: string;
  /** Settings JSON sent as the "settings" multipart field */
  settings: Record<string, unknown>;
  /**
   * Whether this tool uses the 501 FEATURE_NOT_INSTALLED guard.
   * Tools using createToolRoute factory (smart-crop) do not have it.
   */
  has501Guard: boolean;
  /**
   * Whether this tool requires a mask file (e.g. erase-object).
   */
  requiresMask: boolean;
  /**
   * A settings payload that should trigger Zod validation failure.
   * Used for the "invalid settings -> 400" tests.
   */
  invalidSettings: Record<string, unknown>;
}

const AI_TOOLS: AiToolDef[] = [
  {
    id: "remove-background",
    label: "Remove Background",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { blurIntensity: 999 },
  },
  {
    id: "upscale",
    label: "Upscale",
    settings: { scale: 2 },
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { scale: "not-a-number", format: 12345 },
  },
  {
    id: "ocr",
    label: "OCR",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { quality: "invalid-enum", language: "xx" },
  },
  {
    id: "blur-faces",
    label: "Blur Faces",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { blurRadius: 999 },
  },
  {
    id: "enhance-faces",
    label: "Enhance Faces",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { model: "nonexistent-model" },
  },
  {
    id: "smart-crop",
    label: "Smart Crop",
    settings: { mode: "subject", width: 100, height: 100 },
    has501Guard: false,
    requiresMask: false,
    invalidSettings: { mode: "invalid-mode-xyz" },
  },
  {
    id: "colorize",
    label: "Colorize",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { model: "nonexistent-model", intensity: 999 },
  },
  {
    id: "noise-removal",
    label: "Noise Removal",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { tier: "nonexistent-tier" },
  },
  {
    id: "red-eye-removal",
    label: "Red Eye Removal",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { sensitivity: -5 },
  },
  {
    id: "restore-photo",
    label: "Restore Photo",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: { mode: "nonexistent-mode" },
  },
  {
    id: "passport-photo",
    label: "Passport Photo (Analyze)",
    settings: {},
    has501Guard: true,
    requiresMask: false,
    invalidSettings: {},
  },
  {
    id: "erase-object",
    label: "Erase Object",
    settings: {},
    has501Guard: true,
    requiresMask: true,
    invalidSettings: {},
  },
  {
    id: "content-aware-resize",
    label: "Content-Aware Resize",
    settings: { width: 50, square: false },
    has501Guard: false,
    requiresMask: false,
    invalidSettings: { blurRadius: 999 },
  },
];

// ---------------------------------------------------------------------------
// Valid status codes for AI tool responses during testing
// (no AI sidecar running, so processing won't complete)
// ---------------------------------------------------------------------------
/**
 * Acceptable status codes from AI tools in test:
 * - 200: synchronous success (e.g. smart-crop with subject mode)
 * - 202: accepted for async processing (tools that reply early)
 * - 400: format/validation rejected
 * - 422: processing error (format decode failure, etc.)
 * - 501: AI feature not installed (FEATURE_NOT_INSTALLED)
 */
const ACCEPTABLE_AI_CODES = [200, 202, 400, 422, 501];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the route URL for a given AI tool.
 * passport-photo uses /analyze endpoint.
 */
function getToolUrl(toolId: string): string {
  if (toolId === "passport-photo") {
    return "/api/v1/tools/passport-photo/analyze";
  }
  return `/api/v1/tools/${toolId}`;
}

/**
 * Build multipart payload for an AI tool request.
 * Handles the mask requirement for erase-object.
 */
function buildAiPayload(
  fmt: FormatSample,
  tool: AiToolDef,
  buffer: Buffer,
  maskBuffer?: Buffer,
): { body: Buffer; contentType: string } {
  const fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }> = [
    {
      name: "file",
      filename: fmt.file,
      contentType: fmt.mime,
      content: buffer,
    },
  ];

  // erase-object needs a mask file
  if (tool.requiresMask && maskBuffer) {
    fields.push({
      name: "mask",
      filename: "mask.png",
      contentType: "image/png",
      content: maskBuffer,
    });
  }

  // Add settings if non-empty
  if (Object.keys(tool.settings).length > 0) {
    fields.push({
      name: "settings",
      content: JSON.stringify(tool.settings),
    });
  }

  return createMultipartPayload(fields);
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
/** Tiny PNG buffer used as mask for erase-object tests */
let maskBuffer: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Use sample.png as the mask for erase-object
  const maskPath = join(FORMATS_DIR, "sample.png");
  maskBuffer = readFileSync(maskPath);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Cross-format matrix: every AI tool x every format
// ---------------------------------------------------------------------------
describe("AI tool cross-format matrix", () => {
  for (const fmt of FORMAT_SAMPLES) {
    describe(`${fmt.name} input (${fmt.file})`, () => {
      const fixturePath = join(FORMATS_DIR, fmt.file);

      for (const tool of AI_TOOLS) {
        const perTestTimeout = fmt.needsHeifDecoder || fmt.needsCliDecoder ? 180_000 : undefined;

        it(
          `${tool.label}`,
          async () => {
            if (!existsSync(fixturePath)) return;

            const buffer = readFileSync(fixturePath);
            const { body: payload, contentType } = buildAiPayload(
              fmt,
              tool,
              buffer,
              tool.requiresMask ? maskBuffer : undefined,
            );

            const res = await app.inject({
              method: "POST",
              url: getToolUrl(tool.id),
              headers: {
                authorization: `Bearer ${adminToken}`,
                "content-type": contentType,
              },
              body: payload,
            });

            // Must NEVER return 500 (server crash)
            expect(res.statusCode, `${tool.label} + ${fmt.name}: got 500 server error`).not.toBe(
              500,
            );

            // Must be one of the acceptable codes
            expect(ACCEPTABLE_AI_CODES).toContain(res.statusCode);

            // Response must always be valid JSON
            const body = JSON.parse(res.body);

            if (res.statusCode === 501) {
              // Verify FEATURE_NOT_INSTALLED shape
              expect(body.code).toBe("FEATURE_NOT_INSTALLED");
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
            } else if (res.statusCode === 202) {
              // Async processing accepted
              expect(body.jobId).toBeDefined();
              expect(typeof body.jobId).toBe("string");
              expect(body.async).toBe(true);
            } else if (res.statusCode === 200) {
              // Synchronous success -- at minimum, response is valid JSON
              expect(typeof body).toBe("object");
            } else {
              // 400 or 422 error -- verify clean error shape
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
              expect(body.error.length).toBeGreaterThan(0);
            }
          },
          perTestTimeout,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Missing file -> 400 for every AI tool
// ---------------------------------------------------------------------------
describe("Missing file returns 400", () => {
  for (const tool of AI_TOOLS) {
    it(`${tool.label}: no file -> 400`, async () => {
      // Send empty multipart with only settings
      const fields: Array<{
        name: string;
        filename?: string;
        contentType?: string;
        content: Buffer | string;
      }> = [];

      if (Object.keys(tool.settings).length > 0) {
        fields.push({
          name: "settings",
          content: JSON.stringify(tool.settings),
        });
      }

      // Add at least one field so the multipart is valid
      if (fields.length === 0) {
        fields.push({
          name: "settings",
          content: JSON.stringify({}),
        });
      }

      const { body: payload, contentType } = createMultipartPayload(fields);

      const res = await app.inject({
        method: "POST",
        url: getToolUrl(tool.id),
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Tools with 501 guard may return 501 before checking for file
      if (tool.has501Guard) {
        expect([400, 501]).toContain(res.statusCode);
      } else {
        expect(res.statusCode).toBe(400);
      }

      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });
  }
});

// ---------------------------------------------------------------------------
// Unauthenticated -> 401 for every AI tool
// ---------------------------------------------------------------------------
describe("Unauthenticated requests return 401", () => {
  for (const tool of AI_TOOLS) {
    it(`${tool.label}: no auth -> 401`, async () => {
      const fixturePath = join(FORMATS_DIR, "sample.png");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const fmt = FORMAT_SAMPLES.find((f) => f.file === "sample.png")!;
      const { body: payload, contentType } = buildAiPayload(
        fmt,
        tool,
        buffer,
        tool.requiresMask ? maskBuffer : undefined,
      );

      const res = await app.inject({
        method: "POST",
        url: getToolUrl(tool.id),
        headers: {
          // No authorization header
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid settings -> 400 for tools with settings validation
// ---------------------------------------------------------------------------
describe("Invalid settings return 400", () => {
  // Only test tools where we have specifically invalid settings that
  // should trigger Zod validation errors
  const TOOLS_WITH_INVALID_SETTINGS = AI_TOOLS.filter(
    (t) => Object.keys(t.invalidSettings).length > 0,
  );

  for (const tool of TOOLS_WITH_INVALID_SETTINGS) {
    it(`${tool.label}: invalid settings -> 400`, async () => {
      const fixturePath = join(FORMATS_DIR, "sample.png");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);

      const fields: Array<{
        name: string;
        filename?: string;
        contentType?: string;
        content: Buffer | string;
      }> = [
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: buffer,
        },
        {
          name: "settings",
          content: JSON.stringify(tool.invalidSettings),
        },
      ];

      // erase-object needs a mask
      if (tool.requiresMask) {
        fields.push({
          name: "mask",
          filename: "mask.png",
          contentType: "image/png",
          content: maskBuffer,
        });
      }

      const { body: payload, contentType } = createMultipartPayload(fields);

      const res = await app.inject({
        method: "POST",
        url: getToolUrl(tool.id),
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Tools with 501 guard may return 501 before validating settings
      if (tool.has501Guard) {
        expect([400, 501]).toContain(res.statusCode);
      } else {
        expect(res.statusCode).toBe(400);
      }

      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });
  }
});

// ---------------------------------------------------------------------------
// Erase-object specific: missing mask -> 400
// ---------------------------------------------------------------------------
describe("Erase-object missing mask returns 400", () => {
  it("erase-object without mask file -> 400 or 501", async () => {
    const fixturePath = join(FORMATS_DIR, "sample.png");
    if (!existsSync(fixturePath)) return;

    const buffer = readFileSync(fixturePath);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.png",
        contentType: "image/png",
        content: buffer,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    // 501 if AI not installed, 400 if validation catches missing mask
    expect([400, 501]).toContain(res.statusCode);

    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Content-aware-resize specific: missing dimensions -> 400
// ---------------------------------------------------------------------------
describe("Content-aware-resize without dimensions returns 400", () => {
  it("content-aware-resize without width/height/square -> 400", async () => {
    const fixturePath = join(FORMATS_DIR, "sample.png");
    if (!existsSync(fixturePath)) return;

    const buffer = readFileSync(fixturePath);
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "sample.png",
        contentType: "image/png",
        content: buffer,
      },
      {
        name: "settings",
        content: JSON.stringify({}),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/content-aware-resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body: payload,
    });

    expect(res.statusCode).toBe(400);

    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON settings -> 400 for AI tools
// ---------------------------------------------------------------------------
describe("Malformed JSON settings return 400", () => {
  // Test a representative subset of tools (one per pattern)
  const REPRESENTATIVE_TOOLS = AI_TOOLS.filter(
    (t) => !t.requiresMask && t.id !== "passport-photo",
  ).slice(0, 5);

  for (const tool of REPRESENTATIVE_TOOLS) {
    it(`${tool.label}: malformed JSON settings -> 400 or 501`, async () => {
      const fixturePath = join(FORMATS_DIR, "sample.png");
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sample.png",
          contentType: "image/png",
          content: buffer,
        },
        {
          name: "settings",
          content: "{ this is not valid json }}}",
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: getToolUrl(tool.id),
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // 501 if AI not installed, 400 for malformed JSON
      if (tool.has501Guard) {
        expect([400, 501]).toContain(res.statusCode);
      } else {
        expect(res.statusCode).toBe(400);
      }

      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });
  }
});
