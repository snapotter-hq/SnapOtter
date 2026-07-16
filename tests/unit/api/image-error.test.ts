import { isSafeMessageError, markToolInputError, SafeError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { withImageEncodeContext } from "../../../apps/api/src/lib/image-error.js";

interface Settings {
  format: string;
}
const settings: Settings = { format: "webp" };
const input = Buffer.from("");

describe("withImageEncodeContext", () => {
  it("returns the process result unchanged when it succeeds", async () => {
    const wrapped = withImageEncodeContext(
      "Image conversion failed",
      (s: Settings) => s.format,
      async () => ({ buffer: Buffer.from("ok"), filename: "out.webp", contentType: "image/webp" }),
    );
    const result = await wrapped(input, settings, "in.png");
    expect(result.filename).toBe("out.webp");
  });

  it("wraps an opaque encode failure in a SafeError with the target format as code", async () => {
    // Sharp .toBuffer() failures throw an Error whose message is scrubbed to
    // type-only ("Error: Error") in Sentry; the wrapper must author a title.
    const sharpErr = new Error("");
    const wrapped = withImageEncodeContext(
      "Image conversion failed",
      (s: Settings) => s.format,
      async () => {
        throw sharpErr;
      },
    );

    let caught: unknown;
    try {
      await wrapped(input, settings, "in.png");
    } catch (e) {
      caught = e;
    }

    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).message).toBe("Image conversion failed");
    expect((caught as SafeError).kind).toBe("bug");
    expect((caught as SafeError).code).toBe("webp");
    // Original error kept so its stack/location survives in the cause chain.
    expect((caught as SafeError).cause).toBe(sharpErr);
  });

  it("passes an already-authored SafeError through unchanged (no double-wrap)", async () => {
    const inner = new SafeError("Process killed (out of memory)", { kind: "operational" });
    const wrapped = withImageEncodeContext(
      "Image conversion failed",
      () => "webp",
      async () => {
        throw inner;
      },
    );
    await expect(wrapped(input, settings, "in.png")).rejects.toBe(inner);
  });

  it("passes a ToolInputError through unchanged (stays a 400, not a masked bug)", async () => {
    const inputErr = markToolInputError(new Error("Unsupported input"));
    const wrapped = withImageEncodeContext(
      "Image conversion failed",
      () => "webp",
      async () => {
        throw inputErr;
      },
    );
    await expect(wrapped(input, settings, "in.png")).rejects.toBe(inputErr);
  });
});
