import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath, PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRegisteredToolIds, getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtureDir } from "../../fixtures/index.js";
import {
  featureUnavailableDisposition,
  GeneratedCaseAccounting,
} from "../../helpers/generated-case-accounting.js";
import {
  defaultSettingsFor,
  TOOL_SETTINGS_OVERRIDES,
} from "../../helpers/tool-default-settings.js";
import { waitForGeneratedJobArtifact } from "../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * Registry-generated tool x format matrix.
 *
 * Every registered tool is exercised against every input format fixture with
 * its minimal valid settings. The invariant is the factory's error contract:
 * success (200/202), clean rejection (400/413/415/422), or AI-not-installed
 * (501). A 500 or an undecodable "successful" output is a bug.
 *
 * PR runs use the core web formats; FULL_MATRIX=1 (nightly) unlocks all
 * fixtures in tests/fixtures/image/formats/.
 */

const CORE_FORMATS = [
  "sample.png",
  "sample.jpg",
  "sample.webp",
  "sample.gif",
  "sample.svg",
  "sample.heic",
];

const fixtureFiles = process.env.FULL_MATRIX
  ? readdirSync(fixtureDir.formats).filter((f) => !f.startsWith("."))
  : CORE_FORMATS;

const ALLOWED_STATUSES = new Set([200, 202, 400, 413, 415, 422]);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const CUSTOM_ROUTE_TOOLS = new Set([
  "barcode-generate",
  "chart-maker",
  "html-to-image",
  "passport-photo",
  "qr-generate",
]);

/**
 * Raster content types this libvips/Sharp build is guaranteed to decode. Used
 * to decide whether a 200 image response should be pixel-verified. Anything
 * else (PDF, JSON, ZIP, SVG, or a niche raster like BMP/PSD streamed back
 * untouched) carries an honest content-type we don't attempt to decode.
 */
const SHARP_DECODABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
]);

describe("tool x format matrix (generated)", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  it("settings overrides only reference registered tools", () => {
    const registered = new Set(getRegisteredToolIds());
    for (const toolId of Object.keys(TOOL_SETTINGS_OVERRIDES)) {
      expect(registered.has(toolId), `override for unknown tool "${toolId}"`).toBe(true);
    }
  });

  it("default settings are valid for every registered tool", () => {
    const invalid: string[] = [];
    for (const toolId of getRegisteredToolIds()) {
      const config = getToolConfig(toolId);
      if (!config) continue;
      const result = config.settingsSchema.safeParse(defaultSettingsFor(toolId));
      if (!result.success) {
        invalid.push(
          `${toolId}: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }
    }
    expect(
      invalid,
      `tools needing TOOL_SETTINGS_OVERRIDES entries:\n${invalid.join("\n")}`,
    ).toEqual([]);
  });

  for (const tool of TOOLS.filter((candidate) => candidate.modality === "image")) {
    const toolId = tool.id;
    if (CUSTOM_ROUTE_TOOLS.has(toolId)) {
      it.skip(`${toolId} -- custom route covered outside the generated factory matrix`, () => {});
      continue;
    }
    it(`${toolId} handles every input format cleanly`, async (context) => {
      if (PYTHON_SIDECAR_TOOLS.includes(toolId) && !REQUIRE_AI_FEATURES) {
        return context.skip(
          `${toolId}: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install`,
        );
      }
      const accounting = new GeneratedCaseAccounting(toolId, {
        expectedAttempts: fixtureFiles.length,
      });
      for (const fixture of fixtureFiles) {
        const content = readFileSync(join(fixtureDir.formats, fixture));
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: fixture, contentType: "application/octet-stream", content },
          { name: "settings", content: JSON.stringify(defaultSettingsFor(toolId)) },
        ]);
        const res = await testApp.app.inject({
          method: "POST",
          url: apiToolPath(toolId),
          headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
          body,
        });
        accounting.attempt();

        if (res.statusCode === 501 && PYTHON_SIDECAR_TOOLS.includes(toolId)) {
          const payload = JSON.parse(res.body) as { code?: unknown };
          const disposition = featureUnavailableDisposition({
            toolId,
            statusCode: res.statusCode,
            code: payload.code,
            requireAiFeatures: REQUIRE_AI_FEATURES,
          });
          if (disposition === "skip") {
            accounting.skip("optional-feature", `${String(payload.code)} for ${fixture}`);
            continue;
          }
        }

        expect(
          ALLOWED_STATUSES.has(res.statusCode),
          `${toolId} x ${fixture}: status ${res.statusCode}: ${res.body.slice(0, 300)}`,
        ).toBe(true);
        if (res.statusCode === 200) {
          const resType = (res.headers["content-type"]?.toString() ?? "").split(";")[0];
          if (resType !== "application/json") {
            // Tools like bulk-rename/favicon/split stream a ZIP directly.
            if (resType === "application/zip") {
              expect(
                res.rawPayload.subarray(0, 2).toString("latin1"),
                `${toolId} x ${fixture}: ZIP response is not a ZIP`,
              ).toBe("PK");
            }
            accounting.accept();
            continue;
          }
          const payload = JSON.parse(res.body) as {
            downloadUrl?: string;
            error?: unknown;
            success?: boolean;
          };
          if (!payload.downloadUrl) {
            expect(payload.success, `${toolId} x ${fixture}: JSON reported failure`).not.toBe(
              false,
            );
            expect(payload.error, `${toolId} x ${fixture}: JSON reported an error`).toBeUndefined();
            expect(Object.keys(payload).length).toBeGreaterThan(0);
            accounting.accept();
            continue;
          }
          const dl = await testApp.app.inject({
            method: "GET",
            url: payload.downloadUrl,
            headers: { authorization: `Bearer ${adminToken}` },
          });
          expect(dl.statusCode, `${toolId} x ${fixture}: download failed`).toBe(200);
          const outType = (dl.headers["content-type"]?.toString() ?? "").split(";")[0];
          // Allowlist of raster types this libvips build is guaranteed to
          // decode. An allowlist (vs the old denylist) is robust to tools that
          // legitimately stream back niche formats untouched (e.g. edit-metadata
          // writing tags in place on a BMP/PSD): those carry an honest
          // content-type we simply don't pixel-verify, rather than being
          // misread as a corrupt JPEG.
          const sharpDecodable = SHARP_DECODABLE_TYPES.has(outType);
          if (sharpDecodable) {
            // The processed output must actually decode; a corrupt "success" is a bug.
            const meta = await sharp(dl.rawPayload).metadata();
            expect(meta.width, `${toolId} x ${fixture}: output not decodable`).toBeGreaterThan(0);
          }
          accounting.accept();
        }

        if (res.statusCode === 202) {
          const payload = JSON.parse(res.body) as { jobId?: string };
          expect(payload.jobId).toBeDefined();
          await waitForGeneratedJobArtifact(
            testApp.app,
            adminToken,
            toolId,
            payload.jobId as string,
          );
          accounting.accept();
        }
        if (res.statusCode !== 200 && res.statusCode !== 202) accounting.reject();
      }
      expect(accounting.assertCovered().accepted).toBeGreaterThan(0);
      // The nightly avif converters run many slow encodes per test; a busy runner
      // intermittently overran the old 240s cap, so allow the job's full budget.
    }, 600_000);
  }
});
