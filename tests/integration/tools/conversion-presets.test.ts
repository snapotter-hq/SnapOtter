import { existsSync } from "node:fs";
import { sofficeAvailable } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import {
  CONVERSION_PRESETS,
  type ConversionPreset,
  TOOLS,
  type Tool,
  toolSection,
} from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

interface FixtureSpec {
  path: string;
  mime: string;
}

/**
 * Map a source extension to a REAL fixture on disk plus its mime type. Every
 * extension actually used as the first `sourceInputs` entry across the 83
 * presets is wired here. Returns null when no fixture is mapped, which makes
 * the affected preset skip loudly (see the missing-fixture tracking below)
 * instead of faking coverage.
 */
function specForExt(ext: string): FixtureSpec | null {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return { path: fixtures.image.base.jpg100, mime: "image/jpeg" };
    case ".png":
      return { path: fixtures.image.base.png200, mime: "image/png" };
    case ".webp":
      return { path: fixtures.image.base.webp50, mime: "image/webp" };
    case ".gif":
      return { path: fixtures.image.animated.gif, mime: "image/gif" };
    case ".tiff":
    case ".tif":
      return { path: fixtures.image.formats("tiff"), mime: "image/tiff" };
    case ".heic":
    case ".heif":
      return { path: fixtures.image.base.heic200, mime: "image/heic" };
    case ".psd":
      return { path: fixtures.image.formats("psd"), mime: "image/vnd.adobe.photoshop" };
    case ".eps":
      return { path: fixtures.image.formats("eps"), mime: "application/postscript" };
    case ".svg":
    case ".svgz":
      return { path: fixtures.image.base.svg100, mime: "image/svg+xml" };
    case ".pdf":
      return { path: fixtures.document.tiny("pdf"), mime: "application/pdf" };
    case ".mp4":
      return { path: fixtures.video.tiny("mp4"), mime: "video/mp4" };
    case ".mov":
      return { path: fixtures.video.tiny("mov"), mime: "video/quicktime" };
    case ".mkv":
      // No `tiny.mkv` exists (only `tiny-subs.mkv`); use the plain hero clip.
      return { path: fixtures.video.hero.mkv, mime: "video/x-matroska" };
    case ".avi":
      return { path: fixtures.video.tiny("avi"), mime: "video/x-msvideo" };
    case ".webm":
      return { path: fixtures.video.tiny("webm"), mime: "video/webm" };
    case ".m4a":
      return { path: fixtures.audio.tiny("m4a"), mime: "audio/mp4" };
    case ".aac":
      return { path: fixtures.audio.tiny("aac"), mime: "audio/aac" };
    case ".ogg":
      return { path: fixtures.audio.tiny("ogg"), mime: "audio/ogg" };
    case ".wav":
      return { path: fixtures.audio.tiny("wav"), mime: "audio/wav" };
    case ".mp3":
      return { path: fixtures.audio.tiny("mp3"), mime: "audio/mpeg" };
    case ".flac":
      return { path: fixtures.audio.tiny("flac"), mime: "audio/flac" };
    case ".xlsx":
    case ".xls":
      return {
        path: fixtures.document.tiny("xlsx"),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    default:
      return null;
  }
}

/** A preset needs ffmpeg when either its input or output is video/audio. */
function needsFfmpeg(tool: Tool): boolean {
  const modes = [tool.modality, tool.outputModality];
  return modes.some((m) => m === "video" || m === "audio");
}

/**
 * True when the preset's conversion can run given the system binaries present.
 * Mirrors the ffmpeg gate: spreadsheet conversions delegate to LibreOffice, so
 * the spreadsheet preset only runs where `soffice` is installed.
 */
function dependencyAvailable(preset: ConversionPreset, tool: Tool): boolean {
  if (needsFfmpeg(tool) && !ffmpegAvailable()) return false;
  if (preset.base === "convert-spreadsheet" && !sofficeAvailable()) return false;
  return true;
}

interface JobRow {
  status: string;
  outputRefs: unknown;
  error: { message: string; details?: unknown } | null;
}

/** Poll the durable jobs row until it reaches a terminal status. */
async function pollJob(jobId: string): Promise<JobRow | undefined> {
  const { db, schema } = await import("../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: JobRow | undefined;
  for (let i = 0; i < 180; i++) {
    [row] = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId))) as JobRow[];
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return row;
}

// Track presets skipped purely for lack of a wired fixture so the gap is
// visible at the end of the run rather than silently swallowed.
const missingFixtureExts = new Set<string>();
const missingFixturePresets: string[] = [];

afterAll(() => {
  if (missingFixturePresets.length > 0) {
    console.warn(`No fixture for extensions: ${[...missingFixtureExts].sort().join(", ")}`);
    console.warn(`Presets skipped for missing fixture: ${missingFixturePresets.join(", ")}`);
  }
});

describe("conversion presets (all)", () => {
  for (const preset of CONVERSION_PRESETS) {
    const ext = preset.sourceInputs[0];
    const tool = TOOLS.find((t) => t.id === preset.id);
    if (!tool) {
      it(`${preset.id} is registered in TOOLS`, () => {
        expect(tool, `preset ${preset.id} is missing from TOOLS`).toBeDefined();
      });
      continue;
    }
    const section = toolSection(tool);
    const spec = specForExt(ext);
    const haveFixture = spec !== null && existsSync(spec.path);

    if (!haveFixture) {
      missingFixtureExts.add(ext);
      missingFixturePresets.push(`${preset.id} (${ext})`);
    }

    // Skip (visibly) when no fixture exists, or when a required system binary
    // (ffmpeg for media, soffice for spreadsheets) is absent on this host.
    const run = haveFixture && dependencyAvailable(preset, tool) ? it : it.skip;

    run(
      `${preset.id}: ${preset.from} -> ${preset.to}`,
      async () => {
        // A null spec routes to it.skip above; this guard also narrows the type.
        if (!spec) throw new Error(`unreachable: ${preset.id} ran without a fixture`);
        const buf = readFixture(spec.path);
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: `input${ext}`, contentType: spec.mime, content: buf },
          { name: "settings", content: JSON.stringify({}) },
        ]);
        const res = await testApp.app.inject({
          method: "POST",
          url: `/api/v1/tools/${section}/${preset.id}`,
          headers: { authorization: `Bearer ${token}`, "content-type": contentType },
          body,
        });

        expect(
          [200, 202],
          `${preset.id} unexpected status ${res.statusCode}: ${res.body.slice(0, 500)}`,
        ).toContain(res.statusCode);

        if (res.statusCode === 200) {
          // Fast path completed inside the sync window. The success body always
          // carries a jobId regardless of registry vs custom-base route shape.
          const json = JSON.parse(res.body);
          expect(json.jobId, `${preset.id} 200 body missing jobId`).toBeTruthy();
          return;
        }

        // 202: poll the durable row until terminal and require completion.
        const { jobId } = JSON.parse(res.body);
        const jobRow = await pollJob(jobId);
        expect(
          jobRow?.status,
          `${preset.id} job ${jobId} terminal=${jobRow?.status} error=${JSON.stringify(jobRow?.error)}`,
        ).toBe("completed");
      },
      90_000,
    );
  }
});
