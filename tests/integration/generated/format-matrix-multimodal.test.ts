import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath, PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  featureUnavailableDisposition,
  GeneratedCaseAccounting,
  isEngineUnavailableFailure,
  isEngineUnavailableResponse,
} from "../../helpers/generated-case-accounting.js";
import {
  buildGeneratedFixtureIndex,
  type GeneratedFixture,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";
import { buildGeneratedMultipartFields } from "../../helpers/generated-multipart.js";
import { findMissingGeneratedPythonPrerequisite } from "../../helpers/python-gate.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
import { waitForGeneratedJobArtifact } from "../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * Multi-modality tool x format matrix.
 *
 * Extends coverage beyond the image-only matrix in format-matrix-generated.
 * Every non-image tool (video, audio, document, data/file) is exercised
 * against every fixture whose extension matches its acceptedInputs. The
 * contract is identical: no 500s allowed, only clean success or clean
 * rejection (200, 202, 400, 413, 415, 422, 501).
 *
 * AI-bundle tools return 501 FEATURE_NOT_INSTALLED in test environments
 * (no GPU / no model weights). That is correct and validated.
 *
 * Multi-input tools (merge-*, replace-audio, burn/embed-subtitles) are
 * tested with TWO copies of the same fixture to satisfy their minInputs.
 */

const FIXTURES_BY_EXT = buildGeneratedFixtureIndex(generatedFixtureDirectories());
const ALL_FIXTURES = [...FIXTURES_BY_EXT.values()].flat();

// ── Tool classification helpers ──────────────────────────────────

/** Tools that do NOT use the standard factory POST endpoint. */
const CUSTOM_ROUTE_TOOLS = new Set([
  "barcode-generate",
  "chart-maker",
  "qr-generate",
  "passport-photo",
  "html-to-image",
]);

/** Tools that require multiple input files. */
const MULTI_INPUT_TOOLS = new Set([
  "merge-pdf",
  "merge-videos",
  "merge-audio",
  "merge-csvs",
  "replace-audio",
  "burn-subtitles",
  "embed-subtitles",
  "create-zip",
  "images-to-video",
  "sprite-sheet",
  "collage",
  "stitch",
  "compose",
  "compare",
]);

const ALLOWED_STATUSES = new Set([200, 202, 400, 413, 415, 422]);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);
const MIXED_INPUT_TOOLS = new Set(["burn-subtitles", "embed-subtitles", "replace-audio"]);

// ── Select only non-image tools ──────────────────────────────────
const NON_IMAGE_TOOLS = TOOLS.filter((t) => {
  // Skip image-modality tools (covered by format-matrix-generated)
  if (t.modality === "image") return false;
  // Skip custom-route tools that don't support the factory POST
  if (CUSTOM_ROUTE_TOOLS.has(t.id)) return false;
  return true;
});

/**
 * For a given tool, find ALL fixture files that match its acceptedInputs.
 * Returns every fixture whose extension is in the tool's accepted set,
 * so tools like merge-pdf get tested against both tiny.pdf and encrypted.pdf.
 */
/**
 * For multi-input tools, find a second fixture of the same extension
 * (e.g. tiny-a.csv and tiny-b.csv) or reuse the same file twice.
 */
function secondFixtureForExt(ext: string, first: GeneratedFixture): GeneratedFixture {
  const alt = ALL_FIXTURES.find(
    (f) => f.ext === ext && (f.filename !== first.filename || f.dir !== first.dir),
  );
  return alt ?? first;
}

// ── Test suite ───────────────────────────────────────────────────
describe("multi-modality tool x format matrix", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // Sanity: we should have fixtures for each modality
  it("has video, audio, document, and data fixtures", () => {
    const exts = [...FIXTURES_BY_EXT.keys()];
    expect(exts.some((e) => [".mp4", ".mov", ".webm"].includes(e))).toBe(true);
    expect(exts.some((e) => [".mp3", ".wav", ".flac"].includes(e))).toBe(true);
    expect(exts.some((e) => [".pdf", ".docx"].includes(e))).toBe(true);
    expect(exts.some((e) => [".csv", ".json", ".xml"].includes(e))).toBe(true);
  });

  for (const tool of NON_IMAGE_TOOLS) {
    const toolId = tool.id;
    const selectedFixtures = selectFixturesForTool(FIXTURES_BY_EXT, tool);
    const isAiTool = PYTHON_SIDECAR_TOOLS.includes(toolId);
    const isMultiInput = MULTI_INPUT_TOOLS.has(toolId);

    // Tools with empty acceptedInputs that aren't in the non-image set
    // (create-zip accepts anything) -- handle gracefully
    if (selectedFixtures.length === 0 && tool.acceptedInputs.length > 0) {
      it.skip(`${toolId} -- no matching fixtures for ${tool.acceptedInputs.join(", ")}`, () => {});
      continue;
    }

    // create-zip accepts [] (any file); give it a CSV fixture
    const fallbackFixtures =
      selectedFixtures.length === 0
        ? (FIXTURES_BY_EXT.get(".csv") ?? []).slice(0, 1)
        : selectedFixtures;
    const effectiveFixtures = MIXED_INPUT_TOOLS.has(toolId)
      ? fallbackFixtures.filter((fixture) => VIDEO_EXTENSIONS.has(fixture.ext))
      : fallbackFixtures;

    if (effectiveFixtures.length === 0) {
      it.skip(`${toolId} -- no fixtures available`, () => {});
      continue;
    }

    const missingPython = findMissingGeneratedPythonPrerequisite(
      toolId,
      defaultSettingsFor(toolId),
    );
    if (missingPython) {
      it.skip(`${toolId} -- ${missingPython}`, () => {});
      continue;
    }

    describe.skipIf(isAiTool && !REQUIRE_AI_FEATURES)(toolId, () => {
      const accounting = new GeneratedCaseAccounting(toolId, {
        expectedAttempts: effectiveFixtures.length,
      });

      for (const fixture of effectiveFixtures) {
        // 60s per-case timeout clears the 30s SYNC_WAIT_MS test floor (per-fork-env.ts):
        // under load a contended docs/media job can ride the full sync-wait window and
        // return a valid 202 (which this matrix accepts), so the timeout must sit above
        // that floor or a slow-but-valid job is wrongly flagged as a hang.
        it(`${fixture.filename} -> clean status`, async () => {
          const content = readFileSync(join(fixture.dir, fixture.filename));
          const settings = defaultSettingsFor(toolId);

          // Build the multipart payload. Multi-input tools get two files.
          const fields: Array<{
            name: string;
            filename?: string;
            contentType?: string;
            content: Buffer | string;
          }> = [];

          if (MIXED_INPUT_TOOLS.has(toolId) || toolId === "sign-pdf") {
            const companion = (extensions: readonly string[]) => {
              for (const extension of extensions) {
                const fixture = FIXTURES_BY_EXT.get(extension)?.[0];
                if (fixture) {
                  return {
                    filename: fixture.filename,
                    content: readFileSync(join(fixture.dir, fixture.filename)),
                  };
                }
              }
              throw new Error(`${toolId}: missing generated companion for ${extensions.join(",")}`);
            };
            fields.push(
              ...buildGeneratedMultipartFields({
                toolId,
                primary: { filename: fixture.filename, content },
                settings,
                companions: {
                  image: companion([".png", ".jpg"]),
                  audio: companion([".wav", ".mp3"]),
                  subtitle: companion([".srt", ".vtt"]),
                },
              }),
            );
          } else if (isMultiInput) {
            const second = secondFixtureForExt(fixture.ext, fixture);
            const secondContent = readFileSync(join(second.dir, second.filename));
            fields.push(
              {
                name: "file",
                filename: fixture.filename,
                contentType: "application/octet-stream",
                content,
              },
              {
                name: "file",
                filename: second.filename,
                contentType: "application/octet-stream",
                content: secondContent,
              },
            );
          } else {
            fields.push({
              name: "file",
              filename: fixture.filename,
              contentType: "application/octet-stream",
              content,
            });
          }

          if (!MIXED_INPUT_TOOLS.has(toolId) && toolId !== "sign-pdf") {
            fields.push({ name: "settings", content: JSON.stringify(settings) });
          }

          const { body, contentType } = createMultipartPayload(fields);
          const res = await testApp.app.inject({
            method: "POST",
            url: apiToolPath(toolId),
            headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
            body,
          });
          accounting.attempt();

          if (res.statusCode === 501 && isAiTool) {
            const payload = JSON.parse(res.body) as { code?: unknown };
            const disposition = featureUnavailableDisposition({
              toolId,
              statusCode: res.statusCode,
              code: payload.code,
              requireAiFeatures: REQUIRE_AI_FEATURES,
            });
            if (disposition === "skip") {
              accounting.skip(
                "optional-feature",
                `${String(payload.code)} for ${fixture.filename}`,
              );
              return;
            }
          }

          // A host without ffmpeg cannot run media tools at all. That is the
          // operator's container, not a product failure, and CI shards ship
          // without ffmpeg by design, so record it and move on.
          if (isEngineUnavailableResponse(res.statusCode, res.body)) {
            accounting.skip("missing-host-binary", `engine unavailable for ${fixture.filename}`);
            return;
          }

          expect(
            ALLOWED_STATUSES.has(res.statusCode),
            `${toolId} x ${fixture.filename}: status ${res.statusCode}: ${res.body.slice(0, 300)}`,
          ).toBe(true);
          // ── Validate response shape by status ──
          if (res.statusCode === 200) {
            const resType = (res.headers["content-type"]?.toString() ?? "").split(";")[0];
            if (resType === "application/json") {
              const payload = JSON.parse(res.body) as Record<string, unknown>;
              // Most tools return { downloadUrl } or structured data
              // (info, metadata, text extraction). Either shape is valid.
              if (payload.downloadUrl) {
                expect(typeof payload.downloadUrl).toBe("string");
                // Verify the download actually works
                const dl = await testApp.app.inject({
                  method: "GET",
                  url: payload.downloadUrl as string,
                  headers: { authorization: `Bearer ${adminToken}` },
                });
                expect(
                  dl.statusCode,
                  `${toolId} x ${fixture.filename}: download failed (${dl.statusCode})`,
                ).toBe(200);
              }
            } else if (resType === "application/zip") {
              // Tools like video-to-frames, split-csv stream a ZIP directly
              expect(
                res.rawPayload.subarray(0, 2).toString("latin1"),
                `${toolId} x ${fixture.filename}: ZIP response is not valid`,
              ).toBe("PK");
            }
            // Other content types (audio/*, video/*, application/pdf, text/*) are valid
            accounting.accept();
          }

          if (res.statusCode === 202) {
            // Async job envelope
            const payload = JSON.parse(res.body) as Record<string, unknown>;
            expect(
              payload.jobId,
              `${toolId} x ${fixture.filename}: 202 without jobId`,
            ).toBeDefined();
            expect(typeof payload.jobId).toBe("string");

            try {
              await waitForGeneratedJobArtifact(
                testApp.app,
                adminToken,
                toolId,
                payload.jobId as string,
              );
              accounting.accept();
            } catch (error) {
              if (!isEngineUnavailableFailure(error)) throw error;
              accounting.skip("missing-host-binary", `engine unavailable for ${fixture.filename}`);
            }
          }
          if (res.statusCode !== 200 && res.statusCode !== 202) accounting.reject();
        }, 180_000);
      }

      it("conserves generated case accounting", () => {
        accounting.assertCovered();
      });
    });
  }
});
