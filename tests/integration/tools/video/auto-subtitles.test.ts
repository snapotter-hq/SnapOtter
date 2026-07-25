/**
 * Integration tests for the auto-subtitles tool (/api/v1/tools/video/auto-subtitles).
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
  expectKnownTranscript,
  expectSrtArtifact,
  expectVttArtifact,
} from "../../../helpers/installed-ai-output-oracles.js";
import { waitForDownloadedJobArtifact } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFileSync(fixtures.video.tiny("mp4"));
const SPEECH_MP4 = readFileSync(fixtures.video.speech.mp4);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const AI_CAPABILITY = installedAiCapabilityGate(
  "auto-subtitles",
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

describe("auto-subtitles", () => {
  // -- Missing-capability contract --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 FEATURE_NOT_INSTALLED when bundle is absent",
    async () => {
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
    },
  );

  // -- Validation (501 fires before settings parse, so these also 501) --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 even with invalid format (gate fires first)",
    async () => {
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
    },
  );

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

  // -- Installed/required capability contract --

  describe.skipIf(!AI_CAPABILITY.runInstalledContract)(
    "with transcription bundle installed",
    () => {
      it("generates subtitles from video (202 + async)", async () => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "speech-10s.mp4",
            contentType: "video/mp4",
            content: SPEECH_MP4,
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
        const artifact = await waitForDownloadedJobArtifact(
          app,
          adminToken,
          "auto-subtitles",
          json.jobId as string,
          240_000,
        );
        expect(artifact.filename).toBe("speech-10s.srt");
        expect(artifact.contentType).toBe("application/x-subrip");
        const subtitles = artifact.buffer.toString("utf8");
        expectSrtArtifact(subtitles);
        expectKnownTranscript(subtitles);
      }, 300_000);

      it("generates VTT subtitles from video", async () => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "speech-10s.mp4",
            contentType: "video/mp4",
            content: SPEECH_MP4,
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
        const artifact = await waitForDownloadedJobArtifact(
          app,
          adminToken,
          "auto-subtitles",
          json.jobId as string,
          240_000,
        );
        expect(artifact.filename).toBe("speech-10s.vtt");
        expect(artifact.contentType).toBe("text/vtt");
        const subtitles = artifact.buffer.toString("utf8");
        expectVttArtifact(subtitles);
        expectKnownTranscript(subtitles);
      }, 300_000);
    },
  );
});
