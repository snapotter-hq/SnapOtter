import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_CONFIG, COMPRESS_PRESETS, CONVERSION_PRESETS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";
import { registerConversionPresets } from "../../../apps/api/src/routes/tools/conversion-presets.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerConvertAudio } from "../../../apps/api/src/routes/tools/convert-audio.js";
import { registerConvertFont } from "../../../apps/api/src/routes/tools/convert-font.js";
import { registerConvertSpreadsheet } from "../../../apps/api/src/routes/tools/convert-spreadsheet.js";
import { registerConvertSubtitles } from "../../../apps/api/src/routes/tools/convert-subtitles.js";
import { registerConvertVideo } from "../../../apps/api/src/routes/tools/convert-video.js";
import { registerExtractAudio } from "../../../apps/api/src/routes/tools/extract-audio.js";
import { registerGifToVideo } from "../../../apps/api/src/routes/tools/gif-to-video.js";
import { registerVectorize } from "../../../apps/api/src/routes/tools/vectorize.js";
import { registerVideoToGif } from "../../../apps/api/src/routes/tools/video-to-gif.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/**
 * Issue #4417: every raster-to-SVG preset returned a 169-byte SVG whose only
 * path had `d=""`. A preset sends `{ ...locked, ...settings }` to its base's
 * processV2, and vectorize's processV2 (a wrapped legacy process function)
 * never re-parses settings, so the base schema's defaults (threshold 128,
 * filterSpeckle 4, colorMode "bw") never applied and potrace ran with
 * `threshold: undefined`. The preset must hand the base settings that went
 * through the base's own schema.
 */

const app = { post: () => undefined, get: () => undefined } as unknown as FastifyInstance;
const VECTORIZE_PRESETS = CONVERSION_PRESETS.filter((p) => p.base === "vectorize");

let scratchDir: string;
let artwork: Buffer;

beforeAll(async () => {
  registerConvert(app);
  registerCompress(app);
  registerCompressPdf(app);
  registerConvertAudio(app);
  registerConvertFont(app);
  registerConvertSpreadsheet(app);
  registerConvertSubtitles(app);
  registerConvertVideo(app);
  registerExtractAudio(app);
  registerGifToVideo(app);
  registerVectorize(app);
  registerVideoToGif(app);
  registerConversionPresets(app);
  scratchDir = mkdtempSync(join(tmpdir(), "preset-defaults-"));
  // A dark disc on a light field: potrace at the default threshold traces a
  // real outline, and an undefined threshold traces nothing.
  const disc = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<rect width="200" height="200" fill="#eeeeee"/>' +
      '<circle cx="100" cy="100" r="60" fill="#222222"/></svg>',
  );
  artwork = await sharp(disc).png().toBuffer();
});

afterAll(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("raster-to-SVG presets apply the vectorize defaults (#4417)", () => {
  it("covers all five vectorize presets", () => {
    expect(VECTORIZE_PRESETS.map((p) => p.id).sort()).toEqual([
      "eps-to-svg",
      "jpg-to-svg",
      "png-to-svg",
      "psd-to-svg",
      "tiff-to-svg",
    ]);
  });

  it.each(VECTORIZE_PRESETS.map((p) => p.id))("%s traces a non-empty path", async (presetId) => {
    const config = getToolConfig(presetId);
    if (!config?.processV2) throw new Error(`${presetId} must be registered`);

    const result = await config.processV2({
      inputs: [{ buffer: artwork, filename: "artwork.png", ref: "in" }],
      settings: config.settingsSchema.parse({}),
      scratchDir,
      signal: new AbortController().signal,
      report: () => undefined,
    });

    const svg = result.buffer?.toString("utf-8") ?? "";
    expect(svg).not.toContain('d=""');
    const paths = [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((d) => d.trim().length > 0)).toBe(true);
    // The base tool on the same pixels is the reference output.
    const base = getToolConfig("vectorize");
    if (!base) throw new Error("vectorize must be registered");
    const reference = await base.process(artwork, base.settingsSchema.parse({}), "artwork.png");
    expect(svg).toBe(reference.buffer.toString("utf-8"));
  });
});

describe("registry presets lock settings their base schema accepts", () => {
  // The preset path parses `{ ...locked, ...settings }` through the base
  // schema, so a locked value the base rejects would fail every request to
  // that preset. Catch it here instead of in production.
  const registryPresets = [
    ...CONVERSION_PRESETS.filter((p) => BASE_CONFIG[p.base].group === "registry"),
    ...COMPRESS_PRESETS,
  ];

  it("finds the registry presets", () => {
    expect(registryPresets.length).toBeGreaterThan(VECTORIZE_PRESETS.length);
  });

  it("every base schema accepts its presets' locked settings", () => {
    const rejected = registryPresets.flatMap((preset) => {
      const base = getToolConfig(preset.base);
      if (!base) return [`${preset.id}: base ${preset.base} not registered`];
      const result = base.settingsSchema.safeParse(preset.locked);
      return result.success ? [] : [`${preset.id}: ${result.error.message}`];
    });
    expect(rejected).toEqual([]);
  });
});

describe("registry presets keep their base's pre-enqueue checks (#5053)", () => {
  // convert-font refuses a non-font with 400 before a job is queued. A preset
  // that skipped that hook queued the job and failed it later instead.
  const FONT_PRESETS = CONVERSION_PRESETS.filter((p) => p.base === "convert-font");

  it.each(FONT_PRESETS.map((p) => p.id))("%s rejects a non-font before queueing", async (id) => {
    const preValidate = getToolConfig(id)?.preValidate;
    if (!preValidate) throw new Error(`${id} must forward convert-font's preValidate`);
    const notAFont = { filename: "x.otf", buffer: Buffer.from("%PDF-1.7 not a font") };
    // The factory awaits the hook, so a sync throw and a rejection both refuse.
    await expect(
      (async () => preValidate({ inputs: [notAFont], settings: {} }))(),
    ).rejects.toBeInstanceOf(InputValidationError);
  });

  it.each(FONT_PRESETS.map((p) => p.id))("%s accepts a real font", async (id) => {
    const preValidate = getToolConfig(id)?.preValidate;
    if (!preValidate) throw new Error(`${id} must forward convert-font's preValidate`);
    const font = { filename: "tiny.ttf", buffer: readFixture(fixtures.data.ttf) };
    await expect(
      (async () => preValidate({ inputs: [font], settings: {} }))(),
    ).resolves.toBeUndefined();
  });

  it("leaves presets of bases without a hook unchanged", () => {
    expect(getToolConfig("jpg-to-png")?.preValidate).toBeUndefined();
  });
});
