import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
        all: () => [],
      }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { settings: {}, userFiles: { id: {} }, jobs: { id: {}, status: {} } },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    BASE_PATH: "",
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 50,
    RATE_LIMIT_PER_MIN: 0,
  },
}));

vi.mock("@snapotter/doc-engine", () => ({ convertFontPy: vi.fn() }));

import { convertFontPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  assertFontMagic,
  registerConvertFont,
} from "../../../apps/api/src/routes/tools/convert-font.js";

const OTF = Buffer.concat([Buffer.from("OTTO"), Buffer.alloc(16)]);

async function withScratch<T>(fn: (scratchDir: string) => Promise<T>): Promise<T> {
  const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-font-route-"));
  try {
    return await fn(scratchDir);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

function configFor() {
  registerConvertFont({ post: vi.fn() } as unknown as FastifyInstance);
  const config = getToolConfig("convert-font");
  if (!config?.processV2) throw new Error("convert-font did not register a processV2");
  return config as typeof config & { processV2: NonNullable<typeof config.processV2> };
}

afterEach(() => vi.clearAllMocks());

describe("convert-font route", () => {
  it("writes the upload to scratch and converts it to the chosen format", async () => {
    const config = configFor();
    await withScratch(async (scratchDir) => {
      const ctx = {
        inputs: [{ buffer: OTF, filename: "My Font.otf", ref: "uploads/job/input" }],
        settings: { format: "woff2" },
        scratchDir,
        signal: new AbortController().signal,
        report: vi.fn(),
      };
      const result = await config.processV2(ctx);

      const inPath = join(scratchDir, "in-My_Font.otf");
      expect(await readFile(inPath)).toEqual(OTF);
      expect(convertFontPy).toHaveBeenCalledWith(inPath, join(scratchDir, "out.woff2"), "woff2", {
        signal: ctx.signal,
      });
      expect(result).toEqual({
        scratchPath: join(scratchDir, "out.woff2"),
        filename: "My Font.woff2",
        contentType: "font/woff2",
      });
    });
  });

  it("defaults to TTF, the format the request was for (OTF to TTF)", () => {
    expect(configFor().settingsSchema.parse({})).toEqual({ format: "ttf" });
  });

  it("rejects a format it cannot write", () => {
    expect(() => configFor().settingsSchema.parse({ format: "eot" })).toThrow();
  });

  it("rejects a non-font before a job is queued", async () => {
    const config = configFor();
    await expect(
      Promise.resolve().then(() =>
        config.preValidate?.({
          inputs: [{ filename: "fake.ttf", buffer: Buffer.from("%PDF-1.7") }],
          settings: { format: "ttf" },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("isn't a TTF") });
    expect(convertFontPy).not.toHaveBeenCalled();
  });
});

describe("assertFontMagic", () => {
  it.each([
    ["TrueType", Buffer.from([0, 1, 0, 0, 0, 9])],
    ["Apple TrueType", Buffer.from("true....")],
    ["CFF", Buffer.from("OTTO....")],
    ["WOFF", Buffer.from("wOFF....")],
    ["WOFF2", Buffer.from("wOF2....")],
  ])("accepts %s", (_label, buffer) => {
    expect(() => assertFontMagic(buffer)).not.toThrow();
  });

  it("names font collections instead of calling them non-fonts", () => {
    expect(() => assertFontMagic(Buffer.from("ttcf...."))).toThrow(/collections/);
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["PDF", Buffer.from("%PDF-1.7")],
    ["short", Buffer.from("OT")],
  ])("rejects %s input", (_label, buffer) => {
    expect(() => assertFontMagic(buffer)).toThrow(/isn't a TTF/);
  });
});
