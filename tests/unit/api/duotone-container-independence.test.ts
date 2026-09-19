import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { fixtureDir, readFixture } from "../../fixtures/index.js";

/**
 * Issue #1180: duotone gave a different color for the same pixels depending on
 * which container they arrived in.
 *
 * It built its grayscale ramp through an intermediate `toBuffer()` that named no
 * format, so Sharp re-encoded it in the input's own container. Sharp's GIF writer
 * reuses the palette it read the image in with, so a grayscale ramp has to be
 * expressed in the colors the source happened to contain. A flat red GIF has no
 * grays in its palette at all, and red, green and blue alike came back as
 * 76,105,113. A GIF whose palette already holds grays round-trips fine, so
 * photographs drifted rather than collapsing, which is why it went unnoticed.
 *
 * That mechanism is why the swatches below are flat fields: a single-color
 * palette is the input shape that exposes it. Anything added to `swatch` that
 * puts more colors in the palette weakens these cases.
 *
 * The property worth pinning is not a particular number, it is that the tool
 * answers by pixels rather than by container.
 */

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerDuotone(app);
});

type Container = "png" | "gif" | "webp" | "jpeg";

/** A flat field of one color, encoded in the given container. */
function swatch(rgb: [number, number, number], container: Container): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  });
  return image[container]().toBuffer();
}

async function runDuotone(source: Buffer, name: string, intensity: number): Promise<Buffer> {
  const config = getToolConfig("duotone");
  if (!config) throw new Error("duotone must be registered");
  const result = await config.process(source, config.settingsSchema.parse({ intensity }), name);
  return result.buffer;
}

/**
 * Mean of each color channel, alpha ignored.
 *
 * Only meaningful for a flat field. On anything with structure a mean hides
 * local error, so the photographic case below compares pixels instead.
 */
async function channelMeans(buffer: Buffer): Promise<[number, number, number]> {
  const { channels } = await sharp(buffer).stats();
  const [r, g, b] = channels;
  return [Math.round(r.mean), Math.round(g.mean), Math.round(b.mean)];
}

const COLORS: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "red", rgb: [255, 0, 0] },
  { name: "green", rgb: [0, 255, 0] },
  { name: "blue", rgb: [0, 0, 255] },
];

// Both sides of the intensity branch: at 100 the ramp is used directly, below
// it the result is blended back against the original through a raw buffer.
//
// 40 rather than 50 for the blend, because at 50 the blend's two weights are
// equal and swapping them changes nothing, so the one case meant to exercise
// that branch would not notice the weights being inverted.
const INTENSITIES = [100, 40];

describe("duotone answers by pixels, not by container (#1180)", () => {
  describe.each(INTENSITIES)("intensity %i", (intensity) => {
    it.each(COLORS)(
      "$name gives the same color from GIF, WebP and JPEG as from PNG",
      async ({ name, rgb }) => {
        // PNG is the reference because it is the only lossless container here.
        const reference = await channelMeans(
          await runDuotone(await swatch(rgb, "png"), `${name}.png`, intensity),
        );

        for (const container of ["gif", "webp", "jpeg"] as const) {
          const means = await channelMeans(
            await runDuotone(await swatch(rgb, container), `${name}.${container}`, intensity),
          );

          // Lossy output encoders shift a flat field by a unit or two. The bug
          // moved it by sixty, so a tight tolerance still leaves room for the
          // encoders without letting the regression back in.
          for (let channel = 0; channel < 3; channel++) {
            expect(
              Math.abs(means[channel] - reference[channel]),
              `${container} channel ${channel}: got ${means.join(",")}, png gave ${reference.join(",")}`,
            ).toBeLessThanOrEqual(4);
          }
        }
      },
    );
  });

  it("maps different colors to different duotone values through a GIF", async () => {
    // The sharpest symptom of the old behaviour: every saturated color
    // collapsed onto one value, so the tool returned the same image whatever
    // went in.
    const results = await Promise.all(
      COLORS.map(async ({ name, rgb }) =>
        (await channelMeans(await runDuotone(await swatch(rgb, "gif"), `${name}.gif`, 100))).join(
          ",",
        ),
      ),
    );

    expect(new Set(results).size).toBe(COLORS.length);
  });

  it.each(INTENSITIES)(
    "at intensity %i a flat color lands where the ramp arithmetic says",
    async (intensity) => {
      // An absolute anchor. The cross-container cases all compare against PNG
      // computed by the same code, so they would agree with each other even if
      // every container were wrong in the same way. This one does the duotone
      // sum independently.
      const rgb: [number, number, number] = [255, 0, 0];
      const shadow = [0x1e, 0x3a, 0x8a];
      const highlight = [0xfb, 0xbf, 0x24];

      // Derived rather than hard-coded: the grayscale weights belong to libvips,
      // and pinning them here would fail this test for someone else's change.
      // stats() reports on the image as loaded and ignores queued operations,
      // so the grayscale has to be written out before it can be measured.
      const grayBuf = await sharp(await swatch(rgb, "png"))
        .grayscale()
        .png()
        .toBuffer();
      const luminance = (await sharp(grayBuf).stats()).channels[0].mean / 255;

      const k = intensity / 100;
      const expected = shadow.map((lo, i) => {
        const ramp = lo + (highlight[i] - lo) * luminance;
        return Math.round(rgb[i] * (1 - k) + ramp * k);
      });

      const means = await channelMeans(
        await runDuotone(await swatch(rgb, "gif"), "red.gif", intensity),
      );

      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(means[channel] - expected[channel]),
          `channel ${channel}: got ${means.join(",")}, ramp gives ${expected.join(",")}`,
        ).toBeLessThanOrEqual(4);
      }
    },
  );

  it.each(INTENSITIES)(
    "at intensity %i a photographic GIF matches its own PNG transcode pixel for pixel",
    async (intensity) => {
      // Photographs are where the bug hid, because a full palette holds enough
      // near-grays to keep the per-pixel error small. Small is not zero: before
      // the fix this drifted by up to 81 on a pixel while the channel means
      // barely moved, so this case has to compare pixels rather than means.
      const source = readFixture(join(fixtureDir.formats, "sample.gif"));
      const asPng = await sharp(source).png().toBuffer();

      const [fromGif, fromPng] = await Promise.all([
        runDuotone(source, "sample.gif", intensity),
        runDuotone(asPng, "sample.png", intensity),
      ]);

      // A GIF decodes to four channels and a PNG to three, so both are pushed
      // to RGBA before any pixel is compared.
      const [a, b] = await Promise.all([
        sharp(fromGif).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(fromPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      expect(a.data.length).toBe(b.data.length);

      let worst = 0;
      for (let i = 0; i < a.data.length; i++) {
        worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
      }

      // Re-quantising an already-256-color image back to GIF is near lossless,
      // so the fixed path sits at 0 to 1 here.
      expect(worst).toBeLessThanOrEqual(8);
    },
  );
});
