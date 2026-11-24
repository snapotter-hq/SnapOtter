/**
 * #4856: the watermark width is a percentage of the base width, so a narrow
 * base at a low scale rounded it to 0 and sharp's resize threw, answering 422.
 * The watermark must come out at least 1 px wide and the base keep its size.
 */

import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.hoisted(() =>
  vi.fn<(key: string, data: Buffer | string) => Promise<void>>(async () => {}),
);

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: Parameters<typeof actual.putObject>) => putObject(...args),
  };
});

import { registerWatermarkImage } from "../../../apps/api/src/routes/tools/watermark-image.js";

type RouteHandler = (req: unknown, rep: unknown) => Promise<unknown>;

function watermarkHandler(): RouteHandler {
  let handler: RouteHandler | undefined;
  registerWatermarkImage({
    post: (_url: string, fn: RouteHandler) => {
      handler = fn;
    },
  } as never);
  if (!handler) throw new Error("watermark-image route not registered");
  return handler;
}

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
}

async function watermark(main: Buffer, wm: Buffer, settings: Record<string, unknown>) {
  const files = [
    { fieldname: "file", filename: "main.png", content: main },
    { fieldname: "watermark", filename: "wm.png", content: wm },
  ];
  const request = {
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      for (const f of files) {
        yield {
          type: "file" as const,
          fieldname: f.fieldname,
          filename: f.filename,
          file: Readable.from([f.content]),
        };
      }
      yield { type: "field" as const, fieldname: "settings", value: JSON.stringify(settings) };
    },
  };
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
  await watermarkHandler()(request, reply);
  return reply;
}

describe("watermark-image minimum watermark width (#4856)", () => {
  beforeEach(() => {
    putObject.mockClear();
  });

  it.each([
    { label: "40 px base at scale 1", mainW: 40, mainH: 30, scale: 1 },
    { label: "1x1 base at the default scale", mainW: 1, mainH: 1, scale: undefined },
  ])("answers 200 and keeps the base size for a $label", async ({ mainW, mainH, scale }) => {
    const main = await solidPng(mainW, mainH);
    const wm = await solidPng(20, 20);

    const reply = await watermark(main, wm, scale === undefined ? {} : { scale });

    expect(reply.statusCode).toBe(200);
    expect(putObject).toHaveBeenCalledTimes(1);
    const output = putObject.mock.calls[0][1] as Buffer;
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(mainW);
    expect(meta.height).toBe(mainH);
  });
});
