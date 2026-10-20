/**
 * #1671: content-aware-resize runs the shared image input chain in its own
 * catch, which answered 422 "Failed to prepare image" for everything that
 * wasn't an InputValidationError. A server-side fault carrying a 5xx
 * statusCode must reach the error handler with that status instead.
 */

import multipart from "@fastify/multipart";
import { MAX_RESIZE_OUTPUT_DIMENSION, SafeError } from "@snapotter/shared";
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
  ])("rejects %s with 400 before calling seamCarve (#2204)", async (_label, settings) => {
    prepare.mockResolvedValue({ buffer: Buffer.from("prepared-image"), filename: "a.png" });
    const res = await send(settings);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid settings");
    expect(seamCarve).not.toHaveBeenCalled();
  });
});
