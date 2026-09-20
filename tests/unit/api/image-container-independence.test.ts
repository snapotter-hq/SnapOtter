import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBeautify } from "../../../apps/api/src/routes/tools/beautify.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerCircleCrop } from "../../../apps/api/src/routes/tools/circle-crop.js";
import { registerColorBlindness } from "../../../apps/api/src/routes/tools/color-blindness.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { flattenAlpha } from "../../../apps/api/src/routes/tools/image-to-pdf.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerRoundedCrop } from "../../../apps/api/src/routes/tools/rounded-crop.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerVectorize } from "../../../apps/api/src/routes/tools/vectorize.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
import { REGISTRY_EXEMPT } from "../../helpers/registry-exempt.js";

/**
 * Issue #1190: a tool's answer must depend on the pixels it was given, not on
 * the container they arrived in.
 *
 * Two mechanisms broke that, both rooted in libvips reusing the palette it read
 * a GIF with. An unnamed intermediate `toBuffer()` re-encodes mid-pipeline in
 * the input's own container, so a colour the tool just introduced is quantised
 * onto the source palette before the next step ever sees it; and the final
 * encode does the same thing to tools that have no intermediate at all. Both
 * land on the user as a 200 with the wrong colours in it: a green border comes
 * back muddy grey-blue, sharpening a GIF returns halos in the source's colours.
 *
 * A per-tool test for each is how #1180, #1187 and this issue got filed one at
 * a time, so this walks the catalogue instead. Every image tool that takes one
 * image and gives one back is run over the same pixels twice and the two
 * results have to agree: once as a GIF against the PNG transcode of that same
 * GIF, which is where the palette shows; and once as a JPEG against its own PNG
 * transcode, which is where an intermediate's unasked-for second generation
 * shows. A third case pins transparency, which colour alone cannot see.
 *
 * The routes this cannot drive, because they take several files or shell out to
 * a model, are covered by reading the source instead, in
 * sharp-intermediate-formats.test.ts.
 */

const app = { post: () => undefined, get: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
  registerBeautify(app);
  registerBorder(app);
  registerCircleCrop(app);
  registerColorBlindness(app);
  registerCompress(app);
  registerConvert(app);
  registerCrop(app);
  registerDuotone(app);
  registerEditMetadata(app);
  registerGifTools(app);
  registerImageEnhancement(app);
  registerImagePad(app);
  registerMemeGenerator(app);
  registerOptimizeForWeb(app);
  registerPixelate(app);
  registerReplaceColor(app);
  registerResize(app);
  registerRotate(app);
  registerRoundedCrop(app);
  registerSharpening(app);
  registerSmartCrop(app);
  registerStripMetadata(app);
  registerTextOverlay(app);
  registerVectorize(app);
  registerVignette(app);
  registerWatermarkText(app);
});

/**
 * Settings per covered tool.
 *
 * Deliberately not `defaultSettingsFor`. Palette reuse only shows when the tool
 * puts a colour on the canvas that the source palette does not hold, and the
 * defaults walk straight past it: `border` defaults to a black border, and
 * black is roughly what the corruption collapses to, so the tool that started
 * this issue passes on its own defaults. Every entry below either names a
 * colour the source lacks, or turns on an operation that derives new colours
 * (a blend, a halo, an interpolated edge).
 *
 * A tool with no such setting takes `{}` and still earns its place: the guard
 * then pins that its output does not move with the container.
 */
const SETTINGS: Record<string, Record<string, unknown>> = {
  "adjust-colors": { sharpness: 80 },
  beautify: {},
  border: { borderWidth: 10, borderColor: "#008000" },
  "circle-crop": { borderWidth: 6, borderColor: "#008000" },
  "color-blindness": {},
  compress: {},
  convert: { format: "png" },
  crop: { left: 0, top: 0, width: 90, height: 90 },
  duotone: { intensity: 100 },
  "edit-metadata": {},
  "gif-tools": { mode: "resize", percentage: 61 },
  "image-enhancement": {},
  "image-pad": { target: "16:9", padding: 10, color: "#008000" },
  "meme-generator": {
    textLayout: "top-only",
    textBoxes: [{ id: "top", text: "HELLO" }],
    textColor: "#008000",
  },
  "optimize-for-web": {},
  pixelate: { blockSize: 9 },
  "replace-color": { targetColor: "#c82828", replacementColor: "#008000", tolerance: 20 },
  resize: { width: 45 },
  rotate: { angle: 33 },
  "rounded-crop": { borderWidth: 6, borderColor: "#008000" },
  sharpening: { method: "unsharp-mask", amount: 400, radius: 2 },
  // In PYTHON_SIDECAR_TOOLS, but the trim strategy never reaches the sidecar
  // and owns seven of the intermediates this issue fixed, so it is driven
  // here rather than waved through with the model-backed tools.
  "smart-crop": { mode: "trim", padToSquare: true, padColor: "#008000" },
  "strip-metadata": {},
  "text-overlay": { text: "HELLO", color: "#008000", fontSize: 36 },
  vectorize: { invert: true, colorMode: "color" },
  vignette: { strength: 1, color: "#008000", radius: 30 },
  "watermark-text": { text: "HELLO", color: "#008000", opacity: 100, fontSize: 36 },
};

/**
 * Image tools this guard cannot drive, and why.
 *
 * Splitting the reasons out matters. "Not a single image in and out" is a
 * contract, pinned below against REGISTRY_EXEMPT, so a tool that gains a
 * single-buffer process fn has to be dealt with here rather than quietly
 * keeping its exemption. "Registered but not runnable here" is a fact about
 * this environment instead, and only the reason text carries it.
 */
const NOT_SINGLE_IMAGE: Record<string, string> = {
  "barcode-generate": "generator: draws from settings, ignores the input pixels",
  "barcode-read": "reads the image, answers with JSON",
  "bulk-rename": "renames files, never decodes them",
  collage: "several inputs, laid out into one canvas",
  "color-palette": "reads the image, answers with JSON",
  compare: "two inputs, answers with a diff report",
  compose: "two inputs, base plus overlay",
  favicon: "answers with a ZIP of sizes, not one image",
  "find-duplicates": "several inputs, answers with JSON",
  "html-to-image": "generator: renders HTML, ignores the input pixels",
  "image-to-base64": "answers with text",
  "image-to-pdf": "answers with a PDF",
  info: "reads the image, answers with JSON",
  "qr-generate": "generator: draws from settings, ignores the input pixels",
  stitch: "several inputs, joined into one canvas",
  "watermark-image": "two inputs, base plus watermark",
};

/** Registered, single image in and out, but not runnable in a unit test. */
const NOT_RUNNABLE: Record<string, string> = {
  "content-aware-resize": "shells out to the caire binary, absent in CI",
  split: "registered, but answers with a ZIP of tiles rather than one image",
  histogram: "v2-only contract: no single-buffer process to call",
  "lqip-placeholder": "v2-only contract: no single-buffer process to call",
  "sprite-sheet": "v2-only contract: no single-buffer process to call",
};

/**
 * Two flat colours and nothing else, so the source palette is as small as a
 * real GIF gets. Neither is black, white or green, which is what lets the
 * settings above introduce a colour the palette cannot express.
 *
 * The inset squares give the geometric tools something to interpolate across
 * without adding a palette entry, so a resize or a rotate has to invent a
 * colour to land between them.
 */
const RED = { r: 200, g: 40, b: 40 };
const BLUE = { r: 60, g: 60, b: 200 };

async function sourceGif(): Promise<Buffer> {
  const flat = (color: typeof RED, width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: color } })
      .png()
      .toBuffer();

  const base = await sharp({ create: { width: 128, height: 128, channels: 3, background: RED } })
    .composite([
      { input: await flat(BLUE, 64, 128), left: 64, top: 0 },
      { input: await flat(RED, 24, 24), left: 76, top: 20 },
      { input: await flat(BLUE, 24, 24), left: 28, top: 84 },
    ])
    .png()
    .toBuffer();

  return await sharp(base).gif().toBuffer();
}

const sources = (() => {
  let cached: Promise<{ gif: Buffer; png: Buffer }> | undefined;
  const build = async () => {
    const gif = await sourceGif();
    // The PNG side is a transcode of the GIF, not a second render of the same
    // colours, so both runs provably start from identical pixels.
    return { gif, png: await sharp(gif).png().toBuffer() };
  };
  return () => {
    cached ??= build();
    return cached;
  };
})();

/**
 * The same pixels as a JPEG and as the PNG transcode of that JPEG.
 *
 * This is the other half of the bug, and it needs its own pair. The GIF cases
 * above cannot see it: a tool that always answers in PNG, like circle-crop,
 * gives byte-identical output whichever of those two it was handed, while an
 * unnamed intermediate quietly re-encodes to JPEG at Sharp's own default in
 * between. High-frequency detail is what makes that visible, hence the noise.
 */
const lossySources = (() => {
  let cached: Promise<{ jpeg: Buffer; png: Buffer }> | undefined;
  const build = async () => {
    const size = 128;
    const raw = Buffer.alloc(size * size * 3);
    let seed = 20260919;
    for (let i = 0; i < raw.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[i] = seed % 256;
    }
    const jpeg = await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    return { jpeg, png: await sharp(jpeg).png().toBuffer() };
  };
  return () => {
    cached ??= build();
    return cached;
  };
})();

async function run(toolId: string, buffer: Buffer, filename: string) {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const settings = config.settingsSchema.parse(SETTINGS[toolId]);
  return await config.process(buffer, settings, filename);
}

interface Decoded {
  data: Buffer;
  width: number;
  height: number;
  format?: string;
}

async function decode(buffer: Buffer): Promise<Decoded> {
  // Containers disagree on channel count (a GIF decodes to four, a PNG often to
  // three), so both sides are pushed to RGBA before a byte is compared.
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const meta = await sharp(buffer).metadata();
  return { data, width: info.width, height: info.height, format: meta.format };
}

function worstChannelDiff(a: Decoded, b: Decoded): number {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) {
    worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
  }
  return worst;
}

const COVERED = Object.keys(SETTINGS).sort();

describe("image tools answer by pixels, not by container (#1190)", () => {
  it.each(COVERED)("%s gives the same pixels from a GIF as from a PNG", async (toolId) => {
    const { gif, png } = await sources();

    const [fromGif, fromPng] = await Promise.all([
      run(toolId, gif, "source.gif"),
      run(toolId, png, "source.png"),
    ]);

    const [a, b] = await Promise.all([decode(fromGif.buffer), decode(fromPng.buffer)]);

    expect(
      { width: a.width, height: a.height },
      `${toolId}: GIF gave ${a.width}x${a.height} (${a.format}), PNG gave ${b.width}x${b.height} (${b.format})`,
    ).toEqual({ width: b.width, height: b.height });

    // A tool that writes a GIF re-quantises its own result on the way out, and
    // on a lossy container it also pays an encoder pass the other side does
    // not. Both shift a flat field by a unit or two. Palette reuse moved it by
    // a hundred and more, so this leaves the encoders room without letting the
    // regression back in.
    const tolerance = a.format === "png" && b.format === "png" ? 2 : 8;

    expect(
      worstChannelDiff(a, b),
      `${toolId}: worst channel difference between the ${a.format} and ${b.format} runs`,
    ).toBeLessThanOrEqual(tolerance);
  });
});

describe("a JPEG pays no generation the caller did not ask for (#1190)", () => {
  /**
   * Only the tools that answer in PNG whichever container they were handed can
   * be asked this. Both runs then end lossless, the comparison is exact, and
   * any difference at all is an encode the tool performed on itself in between.
   *
   * A tool that answers in the input's own container has one side legitimately
   * paying a JPEG pass, and on this deliberately noisy source that pass alone
   * moves a channel by fifty. No bound there separates a second generation from
   * the one the caller asked for, so those are left to the GIF sweep above,
   * which can tell them apart.
   *
   * The membership is read off what each tool produced rather than listed, so a
   * tool that changes its output container is not quietly dropped from the
   * strict bar.
   */
  it("every tool that answers in PNG gives identical output for identical pixels", async () => {
    const { jpeg, png } = await lossySources();

    const exact: Array<{ toolId: string; worst: number }> = [];
    const deferred: string[] = [];

    for (const toolId of COVERED) {
      const [fromJpeg, fromPng] = await Promise.all([
        run(toolId, jpeg, "source.jpg"),
        run(toolId, png, "source.png"),
      ]);
      const [a, b] = await Promise.all([decode(fromJpeg.buffer), decode(fromPng.buffer)]);

      if (a.format !== "png" || b.format !== "png") {
        deferred.push(`${toolId} (${a.format})`);
        continue;
      }

      expect({ toolId, width: a.width, height: a.height }).toEqual({
        toolId,
        width: b.width,
        height: b.height,
      });
      exact.push({ toolId, worst: worstChannelDiff(a, b) });
    }

    // Named rather than counted. A floor of three was satisfiable by `convert`
    // and `beautify`, neither of which owns an intermediate, so the two tools
    // this case exists for could both have dropped out and left it green.
    expect(
      exact.map((entry) => entry.toolId),
      `deferred: ${deferred.join(", ")}`,
    ).toEqual(expect.arrayContaining(["circle-crop", "rounded-crop"]));

    expect(exact.filter((entry) => entry.worst !== 0)).toEqual([]);
  });

  it("circle-crop keeps the pixels it kept, byte for byte", async () => {
    // The case above compares two runs against each other, which only sees an
    // intermediate whose container depends on the input. Name a lossy format
    // outright and both runs pay it equally, the difference cancels, and the
    // comparison reports agreement: `.jpeg({quality: 80})` in place of the
    // `.png()` in circle-crop measures zero there.
    //
    // This one has no second run to cancel against. circle-crop masks a square
    // to a circle and encodes PNG, so a pixel well inside the circle has to
    // come back exactly as it went in, whatever the tool did on the way.
    const { png } = await lossySources();
    const out = await run("circle-crop", png, "source.png");

    const [before, after] = await Promise.all([
      sharp(png).raw().toBuffer({ resolveWithObject: true }),
      sharp(out.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);

    // circle-crop extracts the largest centred square and adds the border it
    // was given, so the centre of the result is the centre of the source.
    const centre = (info: { width: number; height: number; channels: number }) =>
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    const i = centre(before.info);
    const j = centre(after.info);

    expect([after.data[j], after.data[j + 1], after.data[j + 2]]).toEqual([
      before.data[i],
      before.data[i + 1],
      before.data[i + 2],
    ]);
  });
});

describe("transparency survives the container it arrived in (#1187)", () => {
  /**
   * A GIF carrying real transparency, built from raw pixels rather than a
   * composite so the alpha is unambiguous.
   *
   * The colour cases above cannot reach this: their source is opaque, and
   * image-enhancement only lifts the alpha channel out when there is one.
   */
  async function transparentCorner(): Promise<Buffer> {
    const size = 60;
    const raw = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        raw[i] = 200;
        raw[i + 1] = 40;
        raw[i + 2] = 40;
        raw[i + 3] = x < 20 && y < 20 ? 0 : 255;
      }
    }
    return await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
      .gif()
      .toBuffer();
  }

  async function alphaAt(buffer: Buffer, x: number, y: number): Promise<number> {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data[(y * info.width + x) * info.channels + 3];
  }

  it("image-enhancement keeps a transparent GIF transparent", async () => {
    const gif = await transparentCorner();
    const png = await sharp(gif).png().toBuffer();
    expect(await alphaAt(gif, 5, 5), "the fixture itself must be transparent there").toBe(0);

    const config = getToolConfig("image-enhancement");
    if (!config) throw new Error("image-enhancement must be registered");
    const settings = config.settingsSchema.parse({});

    const fromGif = await config.process(gif, settings, "corner.gif");
    const fromPng = await config.process(png, settings, "corner.png");

    // Absolute values, not just agreement between the two. Asking only that the
    // containers match lets both of them lose the transparency together, which
    // is exactly what one attempt at this fix did: it dropped the alpha on the
    // PNG side too and the cross-container assertion stayed green.
    //
    // Reading the rejoined alpha rather than the exit status, because the
    // failure this pins returns 200 and shows up only as a filled-in
    // background (#1187).
    for (const [label, out] of [
      ["gif", fromGif],
      ["png", fromPng],
    ] as const) {
      expect(await alphaAt(out.buffer, 5, 5), `${label}: the transparent corner`).toBe(0);
      expect(await alphaAt(out.buffer, 40, 40), `${label}: the opaque body`).toBe(255);
    }
  });

  it("image-to-pdf flattens a transparent GIF onto white, not onto its palette", async () => {
    // image-to-pdf answers with a PDF and takes several files, so it sits
    // outside the sweep above. The flatten it runs on the way in is the part
    // this issue touches, so that is what is called here. Note the route only
    // reaches it when the caller asked for a target size; the default path
    // encodes PNG and never flattens.
    const flattened = await flattenAlpha(await transparentCorner());
    const { data, info } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const i = (5 * info.width + 5) * info.channels;
    expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
  });
});

describe("the container guard covers the image catalogue (#1190)", () => {
  const candidates = TOOLS.filter(
    (tool) =>
      tool.modality === "image" &&
      tool.acceptedInputs.includes(".gif") &&
      tool.acceptedInputs.includes(".png"),
  ).map((tool) => tool.id);

  const aiTools = new Set<string>(PYTHON_SIDECAR_TOOLS);

  it("every image tool that reads both GIF and PNG is covered or accounted for", () => {
    const unaccounted = candidates.filter(
      (id) => !SETTINGS[id] && !NOT_SINGLE_IMAGE[id] && !NOT_RUNNABLE[id] && !aiTools.has(id),
    );

    // A new image tool lands here until someone decides which side it is on.
    // Adding it to SETTINGS is the default; the exemption lists want a reason.
    expect(unaccounted).toEqual([]);
  });

  it("nothing is exempt for a contract it no longer has", () => {
    // Against REGISTRY_EXEMPT rather than getToolConfig. Asking the registry
    // looks stronger and is in fact vacuous here: a module this file never
    // imports is absent from it whatever its contract says, so the assertion
    // held for `split`, which is registered. REGISTRY_EXEMPT is the list a tool
    // has to leave when it gains a single-buffer process fn, so reading it
    // means this guard hears about that.
    const wrongly = Object.keys(NOT_SINGLE_IMAGE).filter((id) => !REGISTRY_EXEMPT.has(id));
    expect(wrongly).toEqual([]);
  });

  it("does not keep an exemption for a tool that left the catalogue", () => {
    const known = new Set(candidates);
    const stale = [...Object.keys(NOT_SINGLE_IMAGE), ...Object.keys(NOT_RUNNABLE)].filter(
      (id) => !known.has(id),
    );

    expect(stale).toEqual([]);
  });

  it("every covered tool is a real catalogue entry", () => {
    const known = new Set(candidates);
    expect(COVERED.filter((id) => !known.has(id))).toEqual([]);
  });
});
