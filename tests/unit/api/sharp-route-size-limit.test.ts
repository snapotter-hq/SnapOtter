/**
 * #4699: the hand-written sharp routes answer from their own catch instead of
 * a withImageEncodeContext wrapper, so libvips refusing a result's size read
 * as a failed run (a 422 with libvips' text) or, where the catch rethrows, a
 * reported 500. They map it the way the wrappers do: a 400 with the
 * pixel-limit message.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath } from "@snapotter/shared";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const reportError = vi.fn();

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return { ...actual, putObject: (...args: unknown[]) => putObject(...args) };
});

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError: (...args: unknown[]) => reportError(...args) };
});

import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import { PIXEL_LIMIT_RESULT_MESSAGE } from "../../../apps/api/src/lib/image-error.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerCollage } from "../../../apps/api/src/routes/tools/collage.js";
import { registerStitch } from "../../../apps/api/src/routes/tools/stitch.js";

async function buildApp(register: (app: ReturnType<typeof Fastify>) => void) {
  const app = Fastify();
  await app.register(multipart);
  registerErrorHandler(app);
  register(app);
  await app.ready();
  return app;
}

function multipartBody(
  files: { field: string; name: string; data: Buffer }[],
  settings: Record<string, unknown>,
) {
  const boundary = "----unit";
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      f.data,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
    ),
    Buffer.from(`--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#f00" } })
    .png()
    .toBuffer();

beforeEach(() => {
  putObject.mockReset().mockResolvedValue(undefined);
  reportError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sharp routes outside the encode wrappers (#4699)", () => {
  it("stitch answers a result past WebP's 16383 px side cap with the pixel-limit 400", async () => {
    // Two 9000 px tall strips stacked make an 18000 px canvas. MAX_CANVAS_PIXELS
    // defaults to 0 (unlimited), so only libvips' encoder stands in the way.
    const strip = await png(1, 9000);
    const app = await buildApp(registerStitch);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("stitch"),
        ...multipartBody(
          [
            { field: "file", name: "a.png", data: strip },
            { field: "file", name: "b.png", data: strip },
          ],
          { direction: "vertical", resizeMode: "original", format: "webp" },
        ),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json()).toMatchObject({ error: PIXEL_LIMIT_RESULT_MESSAGE });
      expect(putObject).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("collage answers a size cap with the pixel-limit 400 instead of rethrowing it as a reported 500", async () => {
    vi.spyOn(formatEncoders, "encodeJxl").mockRejectedValueOnce(
      new Error("Processed image is too large for the JXL format"),
    );
    const tile = await png(16, 16);
    const app = await buildApp(registerCollage);
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("collage"),
        ...multipartBody(
          [
            { field: "file1", name: "a.png", data: tile },
            { field: "file2", name: "b.png", data: tile },
          ],
          { templateId: "2-h-equal", outputFormat: "jxl" },
        ),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json()).toMatchObject({ error: PIXEL_LIMIT_RESULT_MESSAGE });
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe("every sharp tool route maps libvips size caps (#4699)", () => {
  const toolsDir = join(import.meta.dirname, "../../../apps/api/src/routes/tools");
  const MAPPERS = [
    "withImageEncodeContext",
    "withImageEncodeContextV2",
    "withAiImageEncodeContext",
    "imageSizeLimitError(",
  ];

  it("routes that import sharp go through an encode wrapper or call imageSizeLimitError", () => {
    const sharpRoutes = readdirSync(toolsDir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /from "sharp";/.test(readFileSync(join(toolsDir, f), "utf8")));
    // Guard against the scan quietly matching nothing after a move.
    expect(sharpRoutes.length).toBeGreaterThan(40);
    const unmapped = sharpRoutes.filter((f) => {
      const src = readFileSync(join(toolsDir, f), "utf8");
      return !MAPPERS.some((m) => src.includes(m));
    });
    expect(
      unmapped,
      "Wrap the process function in withImageEncodeContext, or call imageSizeLimitError() in the route's catch before its generic 422 or rethrow",
    ).toEqual([]);
  });
});
