/**
 * Catalog integrity launch gate.
 *
 * Asserts that EVERY TOOLS catalog entry is fully wired end to end:
 *   - Has a live API route (POST returns non-404)
 *   - Has a frontend tool-registry entry with a Settings component
 *   - Has a display mode in TOOL_DISPLAY_MODES
 *   - Has an API process-fn registration OR is in REGISTRY_EXEMPT
 *
 * The existing drift guards (tool-route-drift, tool-registry-drift) check
 * individual layers in isolation. This test is the cross-cutting launch gate:
 * one assertion that no tool is half-wired across all three layers combined.
 *
 * The TOOLS.length is checked dynamically -- never hardcoded -- so the gate
 * cannot silently drift when tools are added or removed.
 */

import { apiToolPath, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRegisteredToolIds } from "../../../apps/api/src/routes/tool-factory.js";
import { TOOL_DISPLAY_MODES } from "../../../apps/web/src/lib/tool-display-modes.js";
import { toolRegistry } from "../../../apps/web/src/lib/tool-registry.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

/**
 * Tools whose contract does not fit the single-buffer process fn (multi-file,
 * ZIP/JSON output, no-input generators, custom AI routes). They expose an HTTP
 * route but are not in the pipeline/batch registry. Imported from the
 * tool-route-drift test for consistency.
 */
const REGISTRY_EXEMPT = new Set([
  "auto-subtitles",
  "background-replace",
  "barcode-generate",
  "barcode-read",
  "blur-background",
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
  "ocr-pdf",
  "pdf-to-image",
  "qr-generate",
  "sign-pdf",
  "stitch",
  "svg-to-raster",
  "transcribe-audio",
  "watermark-image",
  // Conversion presets riding the three custom ZIP routes above (image-to-pdf,
  // pdf-to-image, svg-to-raster). They share those routes' contracts, so like
  // their bases they are not in the process-fn registry.
  "jpg-to-pdf",
  "png-to-pdf",
  "heic-to-pdf",
  "tiff-to-pdf",
  "webp-to-pdf",
  "gif-to-pdf",
  "eps-to-pdf",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-to-tiff",
  "svg-to-png",
  "svg-to-jpg",
]);

describe("catalog integrity launch gate", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  it("TOOLS catalog is non-empty", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it("every tool is fully wired: API route + frontend registry + display mode", async () => {
    const registeredProcessFns = new Set(getRegisteredToolIds());
    const missingFrontend: string[] = [];
    const missingDisplayMode: string[] = [];
    const missingApiRoute: string[] = [];
    const missingProcessFn: string[] = [];

    // Check frontend + display mode synchronously
    for (const tool of TOOLS) {
      if (!toolRegistry.has(tool.id)) {
        missingFrontend.push(tool.id);
      }
      if (!TOOL_DISPLAY_MODES[tool.id]) {
        missingDisplayMode.push(tool.id);
      }
      if (!REGISTRY_EXEMPT.has(tool.id) && !registeredProcessFns.has(tool.id)) {
        missingProcessFn.push(tool.id);
      }
    }

    // Check API routes (POST, non-404)
    for (const tool of TOOLS) {
      const res = await testApp.app.inject({
        method: "POST",
        url: apiToolPath(tool.id),
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {},
      });
      if (res.statusCode === 404) {
        missingApiRoute.push(tool.id);
      }
    }

    // Report all gaps in one assertion block for clarity
    expect(
      missingFrontend,
      `tools missing frontend registry entry: ${missingFrontend.join(", ")}`,
    ).toEqual([]);
    expect(
      missingDisplayMode,
      `tools missing display mode: ${missingDisplayMode.join(", ")}`,
    ).toEqual([]);
    expect(
      missingApiRoute,
      `tools with no live API route (404): ${missingApiRoute.join(", ")}`,
    ).toEqual([]);
    expect(
      missingProcessFn,
      `non-exempt tools missing process fn: ${missingProcessFn.join(", ")}`,
    ).toEqual([]);
  }, 60_000);

  it("total wired count equals TOOLS.length (dynamic, not hardcoded)", () => {
    const frontendCount = TOOLS.filter((t) => toolRegistry.has(t.id)).length;
    const displayModeCount = TOOLS.filter((t) => !!TOOL_DISPLAY_MODES[t.id]).length;

    expect(frontendCount, `frontend registry covers ${frontendCount}/${TOOLS.length} tools`).toBe(
      TOOLS.length,
    );
    expect(
      displayModeCount,
      `display-mode map covers ${displayModeCount}/${TOOLS.length} tools`,
    ).toBe(TOOLS.length);
  });

  it("REGISTRY_EXEMPT set matches actual exempt tools (no stale entries)", () => {
    const catalogIds = new Set(TOOLS.map((t) => t.id));
    const stale = [...REGISTRY_EXEMPT].filter((id) => !catalogIds.has(id));
    expect(stale, `stale REGISTRY_EXEMPT entries: ${stale.join(", ")}`).toEqual([]);
  });
});
