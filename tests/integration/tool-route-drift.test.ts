import { TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRegisteredToolIds, getToolConfig } from "../../apps/api/src/routes/tool-factory.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

/**
 * Drift guards between the shared TOOLS catalog and the API.
 *
 * Two intentional asymmetries exist and are pinned exactly:
 *  - REGISTRY_EXEMPT: tools whose contract does not fit the single-buffer
 *    process fn (multi-file, ZIP/JSON output, no-input generators, custom AI
 *    routes). They expose an HTTP route but are not in the pipeline/batch
 *    registry. If one of these gains registry support, remove it here.
 *  - LEGACY_ALIASES: extra registered toolIds kept for backwards-compatible
 *    URLs (consolidated into adjust-colors).
 */
const REGISTRY_EXEMPT = new Set([
  "barcode-generate",
  "barcode-read",
  "bulk-rename",
  "collage",
  "color-palette",
  "compare",
  "compose",
  "erase-object",
  "favicon",
  "find-duplicates",
  "html-to-image",
  "image-to-base64",
  "image-to-pdf",
  "info",
  "ocr",
  "pdf-to-image",
  "qr-generate",
  "stitch",
  "svg-to-raster",
  "watermark-image",
]);

const LEGACY_ALIASES = new Set([
  "brightness-contrast",
  "saturation",
  "color-channels",
  "color-effects",
]);

describe("tool route drift", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  it("every non-exempt TOOLS entry has a registered process fn", () => {
    const registered = new Set(getRegisteredToolIds());
    const missing = TOOLS.filter((t) => !REGISTRY_EXEMPT.has(t.id) && !registered.has(t.id)).map(
      (t) => t.id,
    );
    expect(missing, `tools not registered on the API: ${missing.join(", ")}`).toEqual([]);
  });

  it("registry-exempt list is not stale", () => {
    const registered = new Set(getRegisteredToolIds());
    for (const id of REGISTRY_EXEMPT) {
      expect(
        registered.has(id),
        `"${id}" is in REGISTRY_EXEMPT but IS registered now; remove it from the exempt list`,
      ).toBe(false);
    }
  });

  it("every registered tool exposes a settings schema and process fn", () => {
    for (const id of getRegisteredToolIds()) {
      const config = getToolConfig(id);
      expect(config?.settingsSchema, `tool "${id}" has no settings schema`).toBeTruthy();
      expect(typeof config?.process, `tool "${id}" has no process fn`).toBe("function");
    }
  });

  it("no orphan registrations (registered but missing from TOOLS, excluding legacy aliases)", () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    for (const id of getRegisteredToolIds()) {
      if (LEGACY_ALIASES.has(id)) continue;
      expect(ids.has(id), `registered tool "${id}" has no TOOLS definition`).toBe(true);
    }
  });

  it("every TOOLS entry answers on POST /api/v1/tools/:toolId (no dead routes)", async () => {
    for (const tool of TOOLS) {
      const res = await testApp.app.inject({
        method: "POST",
        url: `/api/v1/tools/${tool.id}`,
        headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        payload: {},
      });
      expect(res.statusCode, `tool "${tool.id}" has no live POST route (got 404)`).not.toBe(404);
    }
  }, 60_000);
});
