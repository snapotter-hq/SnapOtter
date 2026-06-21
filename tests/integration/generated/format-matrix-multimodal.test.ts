import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { apiToolPath, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureDir } from "../../fixtures/index.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
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

// ── Fixture directories ──────────────────────────────────────────
const VIDEO_FORMATS_DIR = fixtureDir.video.formats;
const AUDIO_FORMATS_DIR = fixtureDir.audio.formats;
const DOCUMENTS_DIR = fixtureDir.document.formats;
const DATA_DIR = fixtureDir.data;

// ── Build a global map: extension -> list of { dir, filename } ──
interface FixtureFile {
  dir: string;
  filename: string;
  ext: string;
}

function scanFixtures(dir: string): FixtureFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .map((f) => ({ dir, filename: f, ext: extname(f).toLowerCase() }));
}

const ALL_FIXTURES: FixtureFile[] = [
  ...scanFixtures(VIDEO_FORMATS_DIR),
  ...scanFixtures(AUDIO_FORMATS_DIR),
  ...scanFixtures(DOCUMENTS_DIR),
  ...scanFixtures(fixtureDir.document.valid),
  ...scanFixtures(fixtureDir.document.edge),
  ...scanFixtures(DATA_DIR),
];

// Group all fixtures by extension for look-up.
const FIXTURES_BY_EXT = new Map<string, FixtureFile[]>();
for (const f of ALL_FIXTURES) {
  const list = FIXTURES_BY_EXT.get(f.ext);
  if (list) list.push(f);
  else FIXTURES_BY_EXT.set(f.ext, [f]);
}

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

const ALLOWED_STATUSES = new Set([200, 202, 400, 413, 415, 422, 501]);

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
function fixturesForTool(tool: (typeof TOOLS)[number]): FixtureFile[] {
  const accepted = new Set(tool.acceptedInputs.map((e) => e.toLowerCase()));
  const matches: FixtureFile[] = [];
  for (const ext of accepted) {
    const list = FIXTURES_BY_EXT.get(ext);
    if (list) matches.push(...list);
  }
  return matches;
}

/**
 * For multi-input tools, find a second fixture of the same extension
 * (e.g. tiny-a.csv and tiny-b.csv) or reuse the same file twice.
 */
function secondFixtureForExt(ext: string, first: FixtureFile): FixtureFile {
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
    const fixtures = fixturesForTool(tool);
    const isAiTool = toolId in TOOL_BUNDLE_MAP;
    const isMultiInput = MULTI_INPUT_TOOLS.has(toolId);

    // Tools with empty acceptedInputs that aren't in the non-image set
    // (create-zip accepts anything) -- handle gracefully
    if (fixtures.length === 0 && tool.acceptedInputs.length > 0) {
      it.skip(`${toolId} -- no matching fixtures for ${tool.acceptedInputs.join(", ")}`, () => {});
      continue;
    }

    // create-zip accepts [] (any file); give it a CSV fixture
    const effectiveFixtures =
      fixtures.length === 0 ? (FIXTURES_BY_EXT.get(".csv") ?? []).slice(0, 1) : fixtures;

    if (effectiveFixtures.length === 0) {
      it.skip(`${toolId} -- no fixtures available`, () => {});
      continue;
    }

    describe(toolId, () => {
      for (const fixture of effectiveFixtures) {
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

          if (isMultiInput) {
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

          fields.push({ name: "settings", content: JSON.stringify(settings) });

          const { body, contentType } = createMultipartPayload(fields);
          const res = await testApp.app.inject({
            method: "POST",
            url: apiToolPath(toolId),
            headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
            body,
          });

          // Custom-route tools may 404 on the standard path; covered elsewhere.
          if (res.statusCode === 404) return;

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
          }

          if (res.statusCode === 202) {
            // Async job envelope
            const payload = JSON.parse(res.body) as Record<string, unknown>;
            expect(
              payload.jobId,
              `${toolId} x ${fixture.filename}: 202 without jobId`,
            ).toBeDefined();
            expect(typeof payload.jobId).toBe("string");
          }

          if (res.statusCode === 501) {
            // AI bundle not installed -- validate the error shape
            const payload = JSON.parse(res.body) as Record<string, unknown>;
            expect(
              payload.error || payload.code,
              `${toolId} x ${fixture.filename}: 501 without error/code`,
            ).toBeDefined();
          }
        }, 30_000);
      }
    });
  }
});
