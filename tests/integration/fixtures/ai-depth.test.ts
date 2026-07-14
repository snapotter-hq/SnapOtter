/**
 * Tier-2 depth tests: AI tools with real content heroes.
 *
 * Each describe is wrapped in `describe.skipIf` using the AI tool's 501 gate:
 * the route returns 501 FEATURE_NOT_INSTALLED when the bundle is absent.
 * These tests skip cleanly in CI (no bundles) but exercise real AI processing
 * when bundles are installed.
 *
 * Bundle-gated cases treat 501 as a valid skip outcome. Built-in Fast OCR is
 * always exercised and its accepted job is drained to a terminal result.
 */

import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { waitForAcceptedJobOrCancel } from "../settle-job.js";
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
  it("recognizes text from ocr-clean.png through the async Fast path", async () => {
    const res = await postTool(
      "ocr",
      { quality: "fast", language: "en" },
      OCR_CLEAN,
      "ocr-clean.png",
      "image/png",
    );

    expect(res.statusCode).toBe(202);
    const accepted = JSON.parse(res.body) as { jobId?: string; async?: boolean };
    expect(accepted).toMatchObject({ jobId: expect.any(String), async: true });
    const result = await waitForAcceptedJobOrCancel(accepted.jobId as string, "ai", 60_000);
    const payload = result?.resultPayload as Record<string, unknown>;
    expect(payload.text).toBeDefined();
    expect(typeof payload.text).toBe("string");
    // The OCR clean fixture has readable English text
    expect((payload.text as string).length).toBeGreaterThan(0);
    expect(payload.engine).toBe("tesseract");
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
    expect(Array.isArray(row?.outputRefs) ? row.outputRefs.length : 0).toBeGreaterThanOrEqual(1);
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
