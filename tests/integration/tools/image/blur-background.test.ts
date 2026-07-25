/**
 * Integration tests for the blur-background tool (/api/v1/tools/image/blur-background).
 *
 * This tool reuses the rembg bundle (background-removal). Missing-bundle
 * contracts run only when that capability is absent; installed happy paths run
 * when it is detected or REQUIRE_AI_FEATURES makes absence a release failure.
 *
 * The blurBackground helper has dedicated unit coverage in
 * tests/unit/api/background-composite.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isToolInstalled } from "../../../../apps/api/src/lib/feature-status.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { installedAiCapabilityGate } from "../../../helpers/installed-ai-capability-gate.js";
import {
  expectForegroundPreserved,
  expectObservablePixelChange,
} from "../../../helpers/installed-ai-output-oracles.js";
import { waitForDownloadedJobArtifact } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const PORTRAIT = readFixture(fixtures.image.portrait.jpg);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const AI_CAPABILITY = installedAiCapabilityGate(
  "blur-background",
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

describe("blur-background", () => {
  // -- Missing-capability contract --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 FEATURE_NOT_INSTALLED when bundle is absent",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ intensity: 50, feather: 5, format: "png" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/blur-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(501);
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
      expect(json.feature).toBe("background-removal");
      expect(json.featureName).toBe("Background Removal");
      expect(json.estimatedSize).toBeDefined();
    },
  );

  // -- Auth gate --

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/blur-background",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Validation: 501 fires before settings parse, so intensity=0 also 501s --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 even with invalid intensity (gate fires first)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ intensity: 0, feather: 25, format: "bmp" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/blur-background",
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

  // -- 501 with webp format (still gated) --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 with webp format and feather settings",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ intensity: 80, feather: 10, format: "webp" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/blur-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(501);
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    },
  );

  // -- 501 with defaults (empty settings object, Zod fills defaults) --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 with empty settings (defaults applied by Zod)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/blur-background",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect(res.statusCode).toBe(501);
      const json = JSON.parse(res.body);
      expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    },
  );

  // -- Installed/required capability contract --

  describe.skipIf(!AI_CAPABILITY.runInstalledContract)(
    "with background-removal bundle installed",
    () => {
      it("blurs background with full settings (202 + async)", async () => {
        const { body, contentType } = createMultipartPayload([
          {
            name: "file",
            filename: "portrait-color.jpg",
            contentType: "image/jpeg",
            content: PORTRAIT,
          },
          {
            name: "settings",
            content: JSON.stringify({ intensity: 75, feather: 3, format: "webp" }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/blur-background",
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
          "blur-background",
          json.jobId as string,
          240_000,
        );
        expect(artifact.filename).toBe("portrait-color_blurbg.webp");
        expect(artifact.contentType).toBe("image/webp");
        await expectObservablePixelChange(PORTRAIT, artifact.buffer);
        await expectForegroundPreserved(PORTRAIT, artifact.buffer);
      }, 300_000);
    },
  );
});
