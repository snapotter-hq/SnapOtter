/**
 * Tier-2 depth tests: AI tools with real content heroes.
 *
 * Each describe is wrapped in `describe.skipIf` using the AI tool's 501 gate:
 * the route returns 501 FEATURE_NOT_INSTALLED when the bundle is absent.
 * These tests skip cleanly in CI (no bundles) but exercise real AI processing
 * when bundles are installed.
 *
 * To check whether bundles are installed, we probe the route with a real file.
 * If 501, the describe is skipped. If 200/202, we proceed with assertions.
 */

import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const OCR_CLEAN = readFixture(fixtures.image.ocr.clean);
const MULTI_FACE = readFixture(fixtures.image.multiFace);
const SPEECH_WAV = readFixture(fixtures.audio.speech.wav);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

/**
 * Probe whether an AI tool's bundle is installed by sending a minimal request.
 * Returns true if the route responds with anything other than 501.
 */
async function isBundleInstalled(
  toolId: string,
  file: Buffer,
  filename: string,
  ct: string,
): Promise<boolean> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: ct, content: file },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
  return res.statusCode !== 501;
}

// We cannot run `isBundleInstalled` at module scope (app not built yet).
// Instead, each AI test accepts 501 as a valid "not installed" outcome and
// only asserts on content when the response is 200/202.

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** POST a file to an AI tool route. */
async function postTool(
  toolId: string,
  settings: Record<string, unknown>,
  file: Buffer,
  filename: string,
  ct: string,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: ct, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

// -----------------------------------------------------------------------
// OCR depth test
// -----------------------------------------------------------------------
describe("AI depth: OCR on clean text image", () => {
  it("recognizes text from ocr-clean.png (200 with text, or 501 skip)", async () => {
    const res = await postTool("ocr", {}, OCR_CLEAN, "ocr-clean.png", "image/png");

    // 501 = bundle not installed, skip gracefully
    if (res.statusCode === 501) {
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
      return;
    }

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.text).toBeDefined();
    expect(typeof json.text).toBe("string");
    // The OCR clean fixture has readable English text
    expect(json.text.length).toBeGreaterThan(0);
    expect(json.engine).toBeDefined();
  }, 120_000);
});

// -----------------------------------------------------------------------
// Face detection (blur-faces) depth test
// -----------------------------------------------------------------------
describe("AI depth: blur-faces on multi-face hero", () => {
  it("processes multi-face image (202 with job, or 501 skip)", async () => {
    const res = await postTool("blur-faces", {}, MULTI_FACE, "multi-face.webp", "image/webp");

    // 501 = bundle not installed, skip gracefully
    if (res.statusCode === 501) {
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
      return;
    }

    // blur-faces is an async AI tool: 202 with jobId
    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.jobId).toBeDefined();
    expect(json.async).toBe(true);

    // Poll the job to completion
    const { db, schema } = await import("../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, json.jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("completed");
    // Output should have at least one ref (the blurred image)
    expect(Array.isArray(row?.outputRefs)).toBe(true);
    expect((row?.outputRefs as string[]).length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

// -----------------------------------------------------------------------
// Transcribe audio depth test
// -----------------------------------------------------------------------
describe("AI depth: transcribe-audio on speech hero", () => {
  it("transcribes speech WAV (200 with transcript, or 501 skip)", async () => {
    const res = await postTool("transcribe-audio", {}, SPEECH_WAV, "speech-10s.wav", "audio/wav");

    // 501 = bundle not installed, skip gracefully
    if (res.statusCode === 501) {
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
      return;
    }

    // Transcription may be sync (200) or async (202)
    expect([200, 202]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      // Transcript text should be non-empty
      expect(json.text || json.transcript).toBeDefined();
      const text = json.text || json.transcript;
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    } else {
      // 202: just verify job was accepted
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
    }
  }, 120_000);
});
