import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRegisteredToolIds, getToolConfig } from "../../apps/api/src/routes/tool-factory.js";
import { defaultSettingsFor, TOOL_SETTINGS_OVERRIDES } from "../helpers/tool-default-settings.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

/**
 * Registry-generated tool x format matrix.
 *
 * Every registered tool is exercised against every input format fixture with
 * its minimal valid settings. The invariant is the factory's error contract:
 * success (200/202), clean rejection (400/413/415/422), or AI-not-installed
 * (501). A 500 or an undecodable "successful" output is a bug.
 *
 * PR runs use the core web formats; FULL_MATRIX=1 (nightly) unlocks all
 * fixtures in tests/fixtures/formats/.
 */
const FORMATS_DIR = join(__dirname, "..", "fixtures", "formats");

const CORE_FORMATS = [
  "sample.png",
  "sample.jpg",
  "sample.webp",
  "sample.gif",
  "sample.svg",
  "sample.heic",
];

const fixtureFiles = process.env.FULL_MATRIX
  ? readdirSync(FORMATS_DIR).filter((f) => !f.startsWith("."))
  : CORE_FORMATS;

const ALLOWED_STATUSES = new Set([200, 202, 400, 413, 415, 422, 501]);

/** Content types whose payloads are not raster images (skip pixel decode). */
const NON_RASTER_OUTPUT = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "image/svg+xml",
  "text/plain",
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

  for (const tool of TOOLS) {
    const toolId = tool.id;
    it(`${toolId} handles every input format cleanly`, async () => {
      for (const fixture of fixtureFiles) {
        const content = readFileSync(join(FORMATS_DIR, fixture));
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: fixture, contentType: "application/octet-stream", content },
          { name: "settings", content: JSON.stringify(defaultSettingsFor(toolId)) },
        ]);
        const res = await testApp.app.inject({
          method: "POST",
          url: `/api/v1/tools/${toolId}`,
          headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
          body,
        });

        // Custom-route tools can 404 on the standard path; covered elsewhere.
        if (res.statusCode === 404) return;

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
            continue;
          }
          const payload = JSON.parse(res.body) as { downloadUrl?: string };
          if (!payload.downloadUrl) continue;
          const dl = await testApp.app.inject({
            method: "GET",
            url: payload.downloadUrl,
            headers: { authorization: `Bearer ${adminToken}` },
          });
          expect(dl.statusCode, `${toolId} x ${fixture}: download failed`).toBe(200);
          const outType = dl.headers["content-type"]?.toString() ?? "";
          const isRaster =
            !NON_RASTER_OUTPUT.has(outType.split(";")[0]) && outType.startsWith("image/");
          const sharpDecodable =
            isRaster &&
            ![
              "image/heic",
              "image/heif",
              "image/x-icon",
              "image/qoi",
              "image/x-portable-pixmap",
              "image/x-tga",
            ].includes(outType.split(";")[0]);
          if (sharpDecodable) {
            // The processed output must actually decode; a corrupt "success" is a bug.
            const meta = await sharp(dl.rawPayload).metadata();
            expect(meta.width, `${toolId} x ${fixture}: output not decodable`).toBeGreaterThan(0);
          }
        }
      }
    }, 240_000);
  }
});
