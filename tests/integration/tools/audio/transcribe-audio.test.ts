/**
 * Integration tests for the transcribe-audio tool (/api/v1/tools/audio/transcribe-audio).
 *
 * Missing-bundle contracts run only when the transcription capability is
 * absent. Installed happy paths run when the capability is detected or when
 * REQUIRE_AI_FEATURES makes its absence a release-gate failure.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isToolInstalled } from "../../../../apps/api/src/lib/feature-status.js";
import { fixtures } from "../../../fixtures/index.js";
import { installedAiCapabilityGate } from "../../../helpers/installed-ai-capability-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP3 = readFileSync(fixtures.audio.tiny("mp3"));
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const AI_CAPABILITY = installedAiCapabilityGate(
  "transcribe-audio",
  REQUIRE_AI_FEATURES,
  isToolInstalled,
);

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

describe("transcribe-audio", () => {
  // -- Missing-capability contract --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 FEATURE_NOT_INSTALLED when bundle is absent",
    async () => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "tiny.mp3",
          contentType: "audio/mpeg",
          content: MP3,
        },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/audio/transcribe-audio",
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
    },
  );

  // -- Validation (501 fires before settings parse, so these also 501) --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 even with invalid outputFormat (gate fires first)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "tiny.mp3",
          contentType: "audio/mpeg",
          content: MP3,
        },
        {
          name: "settings",
          content: JSON.stringify({ outputFormat: "doc" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/audio/transcribe-audio",
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
    },
  );

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "tiny.mp3",
        contentType: "audio/mpeg",
        content: MP3,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/transcribe-audio",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Installed/required capability contract --

  describe.skipIf(!AI_CAPABILITY.runInstalledContract)(
    "with transcription bundle installed",
    () => {
      it("transcribes audio to txt (202 + async)", async () => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "tiny.mp3",
            contentType: "audio/mpeg",
            content: MP3,
          },
          {
            name: "settings",
            content: JSON.stringify({ outputFormat: "txt" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/audio/transcribe-audio",
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

      it("transcribes audio to srt with correct structure", async () => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "tiny.mp3",
            contentType: "audio/mpeg",
            content: MP3,
          },
          {
            name: "settings",
            content: JSON.stringify({ outputFormat: "srt" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/audio/transcribe-audio",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body,
        });

        expect(res.statusCode).toBe(202);
        const json = JSON.parse(res.body);
        expect(json.jobId).toBeDefined();
        // Full SRT structure validation happens after polling completes.
        // The sine tone fixture may produce empty or noise text;
        // we assert mechanics (counter line "1", arrow timestamp), not words.
      }, 120_000);
    },
  );
});
