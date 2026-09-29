import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isSafeMessageError,
  isToolInputError,
  markToolInputError,
  SafeError,
} from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import {
  asInputErrorIfUndecodable,
  DESCRIPTOR_ENVIRONMENT_MESSAGE,
  DISK_ENVIRONMENT_MESSAGE,
  PIXEL_LIMIT_IMAGE_MESSAGE,
  UNDECODABLE_IMAGE_MESSAGE,
  withImageEncodeContext,
} from "../../../apps/api/src/lib/image-error.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
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
  const failingWith = (err: unknown) =>
    withImageEncodeContext(
      "Image conversion failed",
      (s: Settings) => s.format,
      async () => {
        throw err;
      },
    );

  it.each([
    ["ENOSPC", DISK_ENVIRONMENT_MESSAGE],
    ["EACCES", DISK_ENVIRONMENT_MESSAGE],
    ["EROFS", DISK_ENVIRONMENT_MESSAGE],
    ["EMFILE", DESCRIPTOR_ENVIRONMENT_MESSAGE],
    ["ENFILE", DESCRIPTOR_ENVIRONMENT_MESSAGE],
  ])("turns a %s into an operational SafeError grouped by the errno", async (code, message) => {
    const err = Object.assign(new Error(`${code}: write '/tmp/snapotter-psd/in.psd'`), {
      code,
      syscall: "write",
    });

    const thrown = await failingWith(err)(input, settings, "in.png").catch((e: unknown) => e);

    expect(thrown).toMatchObject({ name: "SafeError", kind: "operational", code, message });
    expect((thrown as Error).cause).toBe(err);
    expect(classifyError(thrown, "worker")).toBe("operational");
    // The user never sees Node's text, which can carry temp paths.
    expect((thrown as Error).message).not.toContain("/tmp");
  });

  it.each([
    // A missing file or binary can be our own wrong path: the same line
    // error-report.ts draws by keeping ENOENT out of the operational set.
    [
      "a missing binary (ENOENT)",
      Object.assign(new Error("spawn magick ENOENT"), { code: "ENOENT" }),
    ],
    // An encoder that fails on its own (even on a full disk) exits non-zero,
    // and execFile then sets code to the exit status, a number.
    [
      "an encoder's numeric exit code",
      Object.assign(new Error("Command failed: magick"), { code: 1 }),
    ],
    ["an opaque failure", new Error("")],
  ])("still wraps %s as a bug", async (_label, err) => {
    const thrown = await failingWith(err)(input, settings, "in.png").catch((e: unknown) => e);
    expect(thrown).toMatchObject({ name: "SafeError", kind: "bug", code: "webp" });
    expect(classifyError(thrown, "worker")).toBe("bug");
  });

  it("wraps a thrown non-Error with an errno-looking code as a bug, not a pass-through", async () => {
    const thrown = await failingWith({ code: "ENOSPC" })(input, settings, "in.png").catch(
      (e: unknown) => e,
    );
    expect(thrown).toMatchObject({ name: "SafeError", kind: "bug" });
  });

  // End to end through a real caller: convert's PSD path writes a temp file
  // before it ever looks for ImageMagick, so a read-only temp dir fails there.
  it.skipIf(process.getuid?.() === 0)(
    "convert's PSD path reports an unwritable temp dir as operational",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "i1450-ro-"));
      await chmod(dir, 0o500);
      const previous = process.env.TMPDIR;
      process.env.TMPDIR = dir;
      try {
        registerConvert({
          post: () => undefined,
          get: () => undefined,
        } as unknown as FastifyInstance);
        const convert = getToolConfig("convert");
        const thrown = await convert
          ?.process(readFixture(fixtures.image.base.png200), { format: "psd" }, "in.png")
          .catch((e: unknown) => e);

        expect(thrown).toMatchObject({
          name: "SafeError",
          kind: "operational",
          code: "EACCES",
          message: DISK_ENVIRONMENT_MESSAGE,
        });
        expect(classifyError(thrown, "worker")).toBe("operational");
      } finally {
        if (previous === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = previous;
        await chmod(dir, 0o700);
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
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
