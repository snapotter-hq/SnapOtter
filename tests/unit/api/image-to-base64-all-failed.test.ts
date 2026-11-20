import { Readable } from "node:stream";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerImageToBase64 } from "../../../apps/api/src/routes/tools/image-to-base64.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;

const PNG = readFixture(fixtures.image.base.png200);
const GARBAGE = readFixture(fixtures.image.hostile.garbage);

interface Base64Body {
  error?: string;
  results: Array<{ filename: string }>;
  errors: Array<{ filename: string; error: string }>;
}

describe("image-to-base64 status when no input succeeds (#4409)", () => {
  let handler: RouteHandler;

  beforeAll(() => {
    const fakeApp = {
      post: vi.fn((_path: string, fn: RouteHandler) => {
        handler = fn;
      }),
    } as unknown as Parameters<typeof registerImageToBase64>[0];
    registerImageToBase64(fakeApp);
  });

  async function invokeRoute(files: Array<{ filename: string; content: Buffer }>) {
    let statusCode = 200;
    let body: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(payload: unknown) {
        body = payload;
        return reply;
      },
    };
    const request = {
      async *parts() {
        for (const file of files) {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: file.filename,
            file: Readable.from([file.content]),
          };
        }
        yield { type: "field" as const, fieldname: "settings", value: "{}" };
      },
    };
    await handler(request, reply);
    return { statusCode, json: body as Base64Body };
  }

  it("answers 400 naming the reason when the only file fails", async () => {
    const { statusCode, json } = await invokeRoute([{ filename: "garbage.jpg", content: GARBAGE }]);

    expect(statusCode).toBe(400);
    expect(json.results).toEqual([]);
    expect(json.errors).toEqual([{ filename: "garbage.jpg", error: "Unrecognized image format" }]);
    expect(json.error).toBe("Unrecognized image format");
  });

  it("answers 400 with every file's reason when all of several files fail", async () => {
    const { statusCode, json } = await invokeRoute([
      { filename: "a.jpg", content: GARBAGE },
      { filename: "b.jpg", content: GARBAGE },
    ]);

    expect(statusCode).toBe(400);
    expect(json.error).toBe(json.errors[0]?.error);
    expect(json.errors.map((e) => e.filename)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("keeps 200 with per-file errors when at least one file succeeds", async () => {
    const { statusCode, json } = await invokeRoute([
      { filename: "good.png", content: PNG },
      { filename: "garbage.jpg", content: GARBAGE },
    ]);

    expect(statusCode).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.results.map((r) => r.filename)).toEqual(["good.png"]);
    expect(json.errors).toEqual([{ filename: "garbage.jpg", error: "Unrecognized image format" }]);
  });
});
