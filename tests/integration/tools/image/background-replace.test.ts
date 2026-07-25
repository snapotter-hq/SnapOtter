/**
 * Integration tests for the background-replace tool (/api/v1/tools/image/background-replace).
 *
 * This tool reuses the rembg bundle (background-removal). Missing-bundle
 * contracts run only when that capability is absent; installed happy paths run
 * when it is detected or REQUIRE_AI_FEATURES makes absence a release failure.
 *
 * The compositeOnColor helper has dedicated unit coverage in
 * tests/unit/api/background-composite.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isToolInstalled } from "../../../../apps/api/src/lib/feature-status.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { installedAiCapabilityGate } from "../../../helpers/installed-ai-capability-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const AI_CAPABILITY = installedAiCapabilityGate(
  "background-replace",
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

describe("background-replace", () => {
  // -- Missing-capability contract --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 FEATURE_NOT_INSTALLED when bundle is absent",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/background-replace",
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
      url: "/api/v1/tools/image/background-replace",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // -- Validation: 501 fires before settings parse, so bad hex also 501s --

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 even with invalid color hex (gate fires first)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ color: "not-a-hex" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/background-replace",
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

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 with gradient settings (gate fires first)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({
            backgroundType: "gradient",
            gradientColor1: "#ff0000",
            gradientColor2: "#0000ff",
            gradientAngle: 90,
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/background-replace",
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

  it.skipIf(!AI_CAPABILITY.runUnavailableContract)(
    "returns 501 with feather and webp format (gate fires first)",
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({
            backgroundType: "color",
            color: "#00ff00",
            feather: 5,
            format: "webp",
          }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/background-replace",
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
      it("replaces background with color (202 + async)", async () => {
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
          { name: "settings", content: JSON.stringify({ color: "#ff0000" }) },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/background-replace",
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

      it("replaces background with gradient (202 + async)", async () => {
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
          {
            name: "settings",
            content: JSON.stringify({
              backgroundType: "gradient",
              gradientColor1: "#ff0000",
              gradientColor2: "#0000ff",
              gradientAngle: 45,
              feather: 3,
              format: "webp",
            }),
          },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/background-replace",
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
    },
  );
});
