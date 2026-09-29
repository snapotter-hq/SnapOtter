import {
  isSafeMessageError,
  isToolInputError,
  markToolInputError,
  SafeError,
} from "@snapotter/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import {
  asInputErrorIfUndecodable,
  PIXEL_LIMIT_IMAGE_MESSAGE,
  UNDECODABLE_IMAGE_MESSAGE,
  withImageEncodeContext,
} from "../../../apps/api/src/lib/image-error.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

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

// #1450: a full disk or a permission error during an encode is the host's
// environment, not our code. Wrapped as a bug-kind SafeError it reported up to
// 10 bug events an hour instead of one operational warning.
describe("withImageEncodeContext and environmental errnos (#1450)", () => {
  const failingWith = (err: Error) =>
    withImageEncodeContext(
      "Image conversion failed",
      (s: Settings) => s.format,
      async () => {
        throw err;
      },
    );

  it.each(["ENOSPC", "EACCES", "EROFS", "EMFILE", "ENFILE"])(
    "rethrows a %s untouched so it classifies as operational",
    async (code) => {
      const err = Object.assign(new Error(`${code}: write '/tmp/snapotter-psd/in.psd'`), {
        code,
        syscall: "write",
      });

      const thrown = await failingWith(err)(input, settings, "in.png").catch((e: unknown) => e);

      expect(thrown).toBe(err);
      expect(classifyError(thrown, "worker")).toBe("operational");
    },
  );

  it("still wraps a missing binary (ENOENT) and a plain failure as bugs", async () => {
    // A missing file or binary can be our own wrong path, so ENOENT stays out
    // of the operational set, the same line error-report.ts draws.
    for (const err of [
      Object.assign(new Error("spawn magick ENOENT"), { code: "ENOENT", syscall: "spawn magick" }),
      new Error(""),
    ]) {
      const thrown = await failingWith(err)(input, settings, "in.png").catch((e: unknown) => e);
      expect(isSafeMessageError(thrown)).toBe(true);
      expect(classifyError(thrown, "worker")).toBe("bug");
    }
  });
});

describe("asInputErrorIfUndecodable", () => {
  // Passes metadata-only intake but fails any full pixel decode (#897).
  const truncatedJpg = readFixture(fixtures.image.hostile.truncated);

  it("classifies a Sharp failure on an undecodable input as ToolInputError", async () => {
    const sharpErr = new Error(
      "VipsJpeg: premature end of JPEG image\njpegload_buffer: load error",
    );
    const err = await asInputErrorIfUndecodable(truncatedJpg, sharpErr);
    expect(isToolInputError(err)).toBe(true);
    expect(err.message).toBe(UNDECODABLE_IMAGE_MESSAGE);
  });

  it("returns the original error when the input decodes fine (downstream bugs stay bugs)", async () => {
    const decodable = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const bug = new TypeError("Cannot read properties of undefined (reading 'mean')");
    const err = await asInputErrorIfUndecodable(decodable, bug);
    expect(err).toBe(bug);
  });

  it("names the pixel limit when an oversized (not corrupt) image trips it", async () => {
    // Valid PNG headers declaring 50000x50000: passes metadata-only intake but
    // exceeds libvips' default limitInputPixels, in both the pipeline and the
    // probe. Calling that "corrupt" would mislead; the message must say "large".
    const bombPng = readFixture(fixtures.image.hostile.bomb);
    const sharpErr = new Error("Input image exceeds pixel limit");
    const err = await asInputErrorIfUndecodable(bombPng, sharpErr);
    expect(isToolInputError(err)).toBe(true);
    expect(err.message).toBe(PIXEL_LIMIT_IMAGE_MESSAGE);
  });

  it("passes through already-classified errors without reclassifying", async () => {
    const safe = new SafeError("Process killed (out of memory)", { kind: "operational" });
    expect(await asInputErrorIfUndecodable(truncatedJpg, safe)).toBe(safe);

    const inputErr = markToolInputError(new Error("Unsupported input"));
    expect(await asInputErrorIfUndecodable(truncatedJpg, inputErr)).toBe(inputErr);
  });
});
