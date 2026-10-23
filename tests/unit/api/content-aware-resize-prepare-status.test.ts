/**
 * #1671: content-aware-resize runs the shared image input chain in its own
 * catch, which answered 422 "Failed to prepare image" for everything that
 * wasn't an InputValidationError. A server-side fault carrying a 5xx
 * statusCode must reach the error handler with that status instead.
 */

import multipart from "@fastify/multipart";
import {
  isSafeMessageError,
  MAX_RESIZE_OUTPUT_DIMENSION,
  SafeError,
  ToolInputError,
} from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn();
const seamCarve = vi.fn();

vi.mock("../../../apps/api/src/modality/input-handler.js", () => ({
  inputHandlerFor: () => ({ prepare: (...args: unknown[]) => prepare(...args) }),
}));

vi.mock("@snapotter/ai", () => ({
  seamCarve: (...args: unknown[]) => seamCarve(...args),
}));

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";

function multipartBody(data: Buffer, settings?: Record<string, unknown>) {
  const boundary = "----unit";
  const settingsPart = settings
    ? Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      )
    : Buffer.alloc(0);
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      data,
      Buffer.from("\r\n"),
      settingsPart,
      Buffer.from(`--${boundary}--\r\n`),
    ]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("content-aware-resize route validation and prepare catch", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    prepare.mockReset();
    seamCarve.mockReset();
    app = Fastify();
    await app.register(multipart);
    registerErrorHandler(app);
    registerContentAwareResize(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (settings?: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/tools/image/content-aware-resize",
      ...multipartBody(Buffer.from("not really an image"), settings),
    });

  it("surfaces a 507 from the input chain instead of answering 422", async () => {
    prepare.mockRejectedValue(
      new SafeError("Workspace is full.", { statusCode: 507, code: "WORKSPACE_FULL" }),
    );
    const res = await send();
    expect(res.statusCode).toBe(507);
    expect(res.json().code).toBe("WORKSPACE_FULL");
  });

  it("still answers 422 for an ordinary failure", async () => {
    prepare.mockRejectedValue(new Error("bad input"));
    const res = await send();
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Failed to prepare image");
    expect(prepare).toHaveBeenCalled();
  });

  it.each([
    ["width at 16384", { width: MAX_RESIZE_OUTPUT_DIMENSION + 1 }],
    ["height at 16384", { height: MAX_RESIZE_OUTPUT_DIMENSION + 1 }],
    [
      "both dimensions at 16384",
      { width: MAX_RESIZE_OUTPUT_DIMENSION + 1, height: MAX_RESIZE_OUTPUT_DIMENSION + 1 },
    ],
    ["width at 100000000", { width: 100_000_000 }],
    ["height at 100000000", { height: 100_000_000 }],
    ["pair over 25 MP limit", { width: 5000, height: 5001 }],
    ["8192 x 8192 pair over 25 MP limit", { width: 8192, height: 8192 }],
    [
      "both dimensions at 16383",
      { width: MAX_RESIZE_OUTPUT_DIMENSION, height: MAX_RESIZE_OUTPUT_DIMENSION },
    ],
  ])("rejects %s with 400 before calling seamCarve (#2204, #2997)", async (_label, settings) => {
    prepare.mockResolvedValue({ buffer: Buffer.from("prepared-image"), filename: "a.png" });
    const res = await send(settings);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid settings");
    expect(seamCarve).not.toHaveBeenCalled();
  });

  it("rejects empty settings on the HTTP route with the missing-dimensions error (#2997)", async () => {
    prepare.mockResolvedValue({ buffer: Buffer.from("prepared-image"), filename: "a.png" });
    const res = await send({});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Either width, height, or square mode must be specified");
    expect(seamCarve).not.toHaveBeenCalled();
  });

  it("preserves operational SafeError timeout message in pipeline/batch process fn (#2997)", async () => {
    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize missing from toolRegistry");
    const timeoutErr = new SafeError(
      "Content-aware resize timed out on this image. Try a smaller image or a larger target size.",
      { kind: "operational", code: "PROCESSING_TIMEOUT", statusCode: 422 },
    );
    seamCarve.mockRejectedValueOnce(timeoutErr);

    const onePxPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await expect(config.process(onePxPng, { width: 1 }, "a.png")).rejects.toBe(timeoutErr);
  });

  it("surfaces ToolInputError from seamCarve on HTTP route and passes it through pipeline process fn (#2997)", async () => {
    const inputErr = new ToolInputError(
      "Content-aware resize can enlarge each side by at most 2x (requested 8192 x 150 from 200 x 150)",
    );
    prepare.mockResolvedValue({ buffer: Buffer.from("prepared-image"), filename: "a.png" });
    seamCarve.mockRejectedValueOnce(inputErr);

    const res = await send({ width: 8192 });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "Content-aware resize failed",
      details: inputErr.message,
    });

    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize missing from toolRegistry");
    seamCarve.mockRejectedValueOnce(inputErr);
    const onePxPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await expect(config.process(onePxPng, { width: 8192 }, "a.png")).rejects.toBe(inputErr);
  });

  it("surfaces 503 ENGINE_UNAVAILABLE when caire binary is missing on HTTP route and pipeline process fn (#3858)", async () => {
    const missingCaireErr = new SafeError(
      "caire binary not found. Install via: go install github.com/esimov/caire/cmd/caire@v1.5.0",
      { kind: "operational", code: "ENGINE_UNAVAILABLE", statusCode: 503 },
    );
    prepare.mockResolvedValue({ buffer: Buffer.from("prepared-image"), filename: "a.png" });
    seamCarve.mockRejectedValueOnce(missingCaireErr);

    const res = await send({ width: 50 });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: missingCaireErr.message,
      code: "ENGINE_UNAVAILABLE",
    });

    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize missing from toolRegistry");
    seamCarve.mockRejectedValueOnce(missingCaireErr);
    const onePxPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await expect(config.process(onePxPng, { width: 1 }, "a.png")).rejects.toBe(missingCaireErr);
  });

  it("wraps unexpected seamCarve failure as bug SafeError in pipeline process fn (#2828)", async () => {
    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize missing from toolRegistry");
    const crashErr = new Error("caire exited with code 2");
    seamCarve.mockRejectedValueOnce(crashErr);
    const onePxPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const err = await config.process(onePxPng, { width: 1 }, "a.png").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isSafeMessageError(err)).toBe(true);
    expect((err as SafeError).message).toBe("Content-aware resize failed");
    expect((err as SafeError).kind).toBe("bug");
    expect((err as SafeError).code).toBe("custom");
    expect((err as SafeError).cause).toBe(crashErr);
  });
});
