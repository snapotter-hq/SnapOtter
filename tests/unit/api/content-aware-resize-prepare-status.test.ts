/**
 * #1671: content-aware-resize runs the shared image input chain in its own
 * catch, which answered 422 "Failed to prepare image" for everything that
 * wasn't an InputValidationError. A server-side fault carrying a 5xx
 * statusCode must reach the error handler with that status instead.
 */

import multipart from "@fastify/multipart";
import { SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn();

vi.mock("../../../apps/api/src/modality/input-handler.js", () => ({
  inputHandlerFor: () => ({ prepare: (...args: unknown[]) => prepare(...args) }),
}));

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";

function multipartBody(data: Buffer) {
  const boundary = "----unit";
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("content-aware-resize prepare catch", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    prepare.mockReset();
    app = Fastify();
    await app.register(multipart);
    registerErrorHandler(app);
    registerContentAwareResize(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const send = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/tools/image/content-aware-resize",
      ...multipartBody(Buffer.from("not really an image")),
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
});
