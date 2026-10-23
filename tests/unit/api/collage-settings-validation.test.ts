import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  putObject: vi.fn<(key: string, data: Buffer | string) => Promise<void>>(async () => {}),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: Parameters<typeof actual.putObject>) => mocks.putObject(...args),
  };
});

import { registerCollage } from "../../../apps/api/src/routes/tools/collage.js";

type RouteHandler = (req: unknown, rep: unknown) => Promise<unknown>;

let handler: RouteHandler;
let pngA: Buffer;
let pngB: Buffer;

async function invokeCollage(settings: Record<string, unknown>) {
  const request = {
    headers: { "content-type": "multipart/form-data; boundary=---test" },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      yield {
        type: "file" as const,
        fieldname: "file1",
        filename: "a.png",
        file: Readable.from([pngA]),
      };
      yield {
        type: "file" as const,
        fieldname: "file2",
        filename: "b.png",
        file: Readable.from([pngB]),
      };
      yield {
        type: "field" as const,
        fieldname: "settings",
        value: JSON.stringify({ templateId: "2-h-equal", ...settings }),
      };
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
  await handler(request, reply);
  return reply;
}

beforeAll(async () => {
  const fakeApp = {
    post: vi.fn((_url: string, fn: RouteHandler) => {
      handler = fn;
    }),
  };
  registerCollage(fakeApp as never);

  pngA = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  pngB = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
});

beforeEach(() => {
  mocks.putObject.mockClear();
});

describe("collage settingsSchema validation (#3857)", () => {
  it.each([
    "red",
    "#fff",
    "#12345",
    "#1234567",
    "#FFFFFFFF",
    "#12345g",
    "not-a-color",
    "FFFFFF",
    "Transparent",
    "",
  ])("rejects invalid backgroundColor %j with 400 Invalid settings", async (backgroundColor) => {
    const reply = await invokeCollage({ backgroundColor });
    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toMatchObject({
      error: "Invalid settings",
      details: expect.stringContaining("backgroundColor"),
    });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it.each(["#FFFFFF", "#000000", "#1a2B3c", "transparent"])(
    "accepts valid backgroundColor %j",
    async (backgroundColor) => {
      const reply = await invokeCollage({ backgroundColor });
      expect(reply.statusCode).toBe(200);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["21:9", "square", "2:3", "invalid", ""])(
    "rejects unsupported aspectRatio %j with 400 Invalid settings",
    async (aspectRatio) => {
      const reply = await invokeCollage({ aspectRatio });
      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toMatchObject({
        error: "Invalid settings",
        details: expect.stringContaining("aspectRatio"),
      });
      expect(mocks.putObject).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["free", 2400, 1800],
    ["1:1", 2400, 2400],
    ["4:3", 2400, 1800],
    ["3:2", 2400, 1600],
    ["16:9", 2400, 1350],
    ["9:16", 1350, 2400],
    ["4:5", 1920, 2400],
  ] as const)(
    "accepts supported aspectRatio %j and renders %dx%d canvas",
    async (aspectRatio, expectedW, expectedH) => {
      const reply = await invokeCollage({ aspectRatio });
      expect(reply.statusCode).toBe(200);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const outBuffer = mocks.putObject.mock.calls[0]?.[1];
      expect(Buffer.isBuffer(outBuffer)).toBe(true);
      const meta = await sharp(outBuffer as Buffer).metadata();
      expect([meta.width, meta.height]).toEqual([expectedW, expectedH]);
    },
  );
});
