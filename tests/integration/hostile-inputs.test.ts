import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOOL_DISPLAY_MODES } from "../../apps/web/src/lib/tool-display-modes.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

/**
 * Hostile-input matrix: every tool route must reject malformed, truncated,
 * lying, or bomb-shaped files with a clean 4xx (or 501 for uninstalled AI
 * bundles). A 500, a hang, or a success response for garbage is a bug in the
 * tool, not in this test.
 *
 * Fixtures come from scripts/generate-hostile-fixtures.mjs (committed).
 */
const HOSTILE_DIR = join(__dirname, "..", "fixtures", "hostile");

/** Fixtures that are unreadable garbage: the server must NOT report success. */
const GARBAGE_FIXTURES = ["truncated.jpg", "zero-byte.png", "garbage.jpg", "bomb-50000x50000.png"];

/** Valid PNG bytes behind a lying .jpg extension: success or clean 4xx are both
 * fine (tools sniff content, some require a specific input type); 5xx is not. */
const MISMATCH_FIXTURE = "png-bytes.jpg";

const REJECT_STATUSES = new Set([400, 413, 415, 422, 501]);

// Tools that never decode the uploaded pixel data: no-dropzone generators take
// input from settings, bulk-rename zips bytes verbatim, and the metadata tools
// operate on metadata segments only. Succeeding on a file with a valid header
// but broken pixel data is correct behavior for them; everything else must
// reject.
const INPUT_AGNOSTIC = new Set(
  TOOLS.filter((t) => TOOL_DISPLAY_MODES[t.id] === "no-dropzone").map((t) => t.id),
);
INPUT_AGNOSTIC.add("bulk-rename");
INPUT_AGNOSTIC.add("edit-metadata");
INPUT_AGNOSTIC.add("strip-metadata");
INPUT_AGNOSTIC.add("info");
INPUT_AGNOSTIC.add("image-to-base64");

/** Server-error statuses; 501 (feature not installed) is a clean rejection. */
const SERVER_ERRORS = [500, 502, 503, 504];

describe("hostile input matrix", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  async function postFile(toolId: string, fixtureName: string) {
    const content = readFileSync(join(HOSTILE_DIR, fixtureName));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: fixtureName, contentType: "application/octet-stream", content },
      { name: "settings", content: "{}" },
    ]);
    const started = Date.now();
    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/v1/tools/${toolId}`,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    return { res, elapsedMs: Date.now() - started };
  }

  for (const tool of TOOLS) {
    const toolId = tool.id;
    it(`${toolId} rejects hostile files cleanly`, async () => {
      for (const fixture of GARBAGE_FIXTURES) {
        const { res, elapsedMs } = await postFile(toolId, fixture);

        expect(
          SERVER_ERRORS.includes(res.statusCode),
          `${toolId} returned ${res.statusCode} for ${fixture}: ${res.body.slice(0, 300)}`,
        ).toBe(false);
        expect(elapsedMs, `${toolId} took ${elapsedMs}ms on ${fixture}`).toBeLessThan(15_000);

        if (INPUT_AGNOSTIC.has(toolId)) continue;

        expect(
          REJECT_STATUSES.has(res.statusCode),
          `${toolId} did not reject ${fixture} (got ${res.statusCode})`,
        ).toBe(true);

        // Error responses must be structured JSON, not stack traces
        const parsed = JSON.parse(res.body) as { error?: string };
        expect(parsed.error, `${toolId} 4xx body has no error field for ${fixture}`).toBeTruthy();
      }

      // Lying extension with valid content: anything but a server error is fine
      const { res } = await postFile(toolId, MISMATCH_FIXTURE);
      expect(
        SERVER_ERRORS.includes(res.statusCode),
        `${toolId} returned ${res.statusCode} for ${MISMATCH_FIXTURE}: ${res.body.slice(0, 300)}`,
      ).toBe(false);
    }, 120_000);
  }
});
