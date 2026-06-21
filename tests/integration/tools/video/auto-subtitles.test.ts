/**
 * Integration tests for the auto-subtitles tool (/api/v1/tools/video/auto-subtitles).
 *
 * The transcription bundle (faster-whisper) is not installed locally, so the
 * 501 gate is always hit. Validation paths (bad settings) fire after the 501
 * check. The bundle-gated happy path lives in a skipped describe for
 * in-container-after-install runs.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFileSync(fixtures.video.tiny("mp4"));

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

describe("auto-subtitles", () => {
  // -- 501 gate (always fires locally: bundle never installed) --

  it("returns 501 FEATURE_NOT_INSTALLED when bundle is absent", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "tiny.mp4",
        contentType: "video/mp4",
        content: MP4,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/video/auto-subtitles",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("transcription");
    expect(json.featureName).toBe("Transcription");
    expect(json.estimatedSize).toBeDefined();
  });

  // -- Validation (501 fires before settings parse, so these also 501) --

  it("returns 501 even with invalid format (gate fires first)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "tiny.mp4",
        contentType: "video/mp4",
        content: MP4,
      },
      {
        name: "settings",
        content: JSON.stringify({ format: "ass" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/video/auto-subtitles",
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

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "tiny.mp4",
        contentType: "video/mp4",
        content: MP4,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/video/auto-subtitles",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Bundle-gated happy path (skipped locally, runs after bundle install) --

  // The transcription bundle is ~600 MB and only available in Docker.
  // These tests run when the bundle is installed (e.g., during Task 7 smoke).
  // Locally they always skip.
  describe.skip("with transcription bundle installed", () => {
    it("generates subtitles from video (202 + async)", async () => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "tiny.mp4",
          contentType: "video/mp4",
          content: MP4,
        },
        {
          name: "settings",
          content: JSON.stringify({ format: "srt" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/video/auto-subtitles",
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
    }, 120_000);

    it("generates VTT subtitles from video", async () => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "tiny.mp4",
          contentType: "video/mp4",
          content: MP4,
        },
        {
          name: "settings",
          content: JSON.stringify({ format: "vtt" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/video/auto-subtitles",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(202);
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      // Full VTT structure validation (WEBVTT header, dot timestamps)
      // happens after polling completes in the Task 7 smoke.
    }, 120_000);
  });
});
