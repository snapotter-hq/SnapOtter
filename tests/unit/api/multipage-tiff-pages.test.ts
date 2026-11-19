import { isToolInputError } from "@snapotter/shared";
import AdmZip from "adm-zip";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { readTiffPagesFor } from "../../../apps/api/src/lib/animated-image.js";
import { MAX_GIF_FRAMES } from "../../../apps/api/src/lib/gif-limits.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

/**
 * Issue #4419: resize and split opened a multi-page TIFF with a bare
 * `sharp(buffer)`, which decodes page 1 only, then wrote a one-page TIFF back
 * out with a 200. The other pages vanished without a warning.
 *
 * multipage.tiff is 10 pages of 800x600.
 */

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerResize(app);
  registerSplit(app);
});

async function run(toolId: string, buffer: Buffer, settings: unknown, filename: string) {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  return await config.process(buffer, config.settingsSchema.parse(settings), filename);
}

async function pageShape(buffer: Buffer) {
  const meta = await sharp(buffer, { pages: -1 }).metadata();
  return {
    format: meta.format,
    pages: meta.pages ?? 1,
    width: meta.width,
    pageHeight: meta.pageHeight ?? meta.height,
  };
}

/** A multi-page TIFF of `pages` solid frames, all `size` square. */
async function tiffOfPages(pages: number, size = 4): Promise<Buffer> {
  const frame = await sharp({
    create: { width: size, height: size, channels: 3, background: "gray" },
  })
    .png()
    .toBuffer();
  return await sharp(
    Array.from({ length: pages }, () => frame),
    {
      join: { across: 1, animated: true },
    },
  )
    .tiff()
    .toBuffer();
}

async function expectInputError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isToolInputError(err)).toBe(true);
  expect((err as Error).message).toMatch(pattern);
}

describe("resize on a multi-page TIFF (#4419)", () => {
  it("resizes every page instead of returning page 1 alone", async () => {
    const result = await run(
      "resize",
      readFixture(fixtures.image.multipageTiff),
      { percentage: 50 },
      "multipage.tiff",
    );

    expect(result.contentType).toBe("image/tiff");
    expect(await pageShape(result.buffer)).toEqual({
      format: "tiff",
      pages: 10,
      width: 400,
      pageHeight: 300,
    });
  });

  it("leaves a single-page TIFF as a single page", async () => {
    const result = await run(
      "resize",
      readFixture(fixtures.image.formats("tiff")),
      { width: 50 },
      "sample.tiff",
    );

    const shape = await pageShape(result.buffer);
    expect(shape.pages).toBe(1);
    expect(shape.width).toBe(50);
  });

  it("refuses a TIFF with more pages than can be processed and names the count", async () => {
    const pages = MAX_GIF_FRAMES + 1;
    await expectInputError(
      run("resize", await tiffOfPages(pages), { percentage: 50 }, "many.tiff"),
      new RegExp(`${pages} pages`),
    );
  });

  it("refuses a TIFF whose pages have different sizes rather than keeping page 1", async () => {
    await expectInputError(
      run(
        "resize",
        readFixture(fixtures.image.edge.multipageMixedSizesTiff),
        { percentage: 50 },
        "mixed.tiff",
      ),
      /2 pages of different sizes/,
    );
  });
});

describe("split on a multi-page TIFF (#4419)", () => {
  it("keeps every page in each TIFF tile", async () => {
    const result = await run(
      "split",
      readFixture(fixtures.image.multipageTiff),
      { columns: 2, rows: 1 },
      "multipage.tiff",
    );

    const entries = new AdmZip(result.buffer).getEntries();
    expect(entries.map((e) => e.entryName).sort()).toEqual([
      "multipage_r1_c1.tiff",
      "multipage_r1_c2.tiff",
    ]);
    for (const entry of entries) {
      expect(await pageShape(entry.getData())).toEqual({
        format: "tiff",
        pages: 10,
        width: 400,
        pageHeight: 600,
      });
    }
  });

  it("takes page 1 when the tiles go to a format with no pages, like convert does", async () => {
    const result = await run(
      "split",
      readFixture(fixtures.image.multipageTiff),
      { columns: 2, rows: 1, outputFormat: "png" },
      "multipage.tiff",
    );

    const entries = new AdmZip(result.buffer).getEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(await pageShape(entry.getData())).toEqual({
        format: "png",
        pages: 1,
        width: 400,
        pageHeight: 600,
      });
    }
  });

  it("refuses a TIFF with more pages than can be processed", async () => {
    const pages = MAX_GIF_FRAMES + 1;
    await expectInputError(
      run("split", await tiffOfPages(pages, 20), { columns: 2, rows: 1 }, "many.tiff"),
      new RegExp(`${pages} pages`),
    );
  });
});

describe("readTiffPagesFor (#4419)", () => {
  it("reports every page of a multi-page TIFF headed back out as TIFF", async () => {
    const info = await readTiffPagesFor(readFixture(fixtures.image.multipageTiff), "tiff");
    expect(info).toMatchObject({ animated: true, pages: 10, pageHeight: 600, width: 800 });
  });

  it("treats the TIFF as a still for any other output format", async () => {
    const info = await readTiffPagesFor(readFixture(fixtures.image.multipageTiff), "png");
    expect(info.animated).toBe(false);
  });

  it("treats a single-page TIFF and a non-TIFF input as stills", async () => {
    expect(
      (await readTiffPagesFor(readFixture(fixtures.image.formats("tiff")), "tiff")).animated,
    ).toBe(false);
    expect(
      (await readTiffPagesFor(readFixture(fixtures.image.formats("gif")), "tiff")).animated,
    ).toBe(false);
  });
});
