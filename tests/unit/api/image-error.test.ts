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
import { describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import {
  asInputErrorIfUndecodable,
  DESCRIPTOR_ENVIRONMENT_MESSAGE,
  DISK_ENVIRONMENT_MESSAGE,
  PIXEL_LIMIT_IMAGE_MESSAGE,
  UNDECODABLE_IMAGE_MESSAGE,
  withAiImageEncodeContext,
  withImageEncodeContext,
  withImageEncodeContextV2,
} from "../../../apps/api/src/lib/image-error.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { putObject } from "../../../apps/api/src/lib/object-storage.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerBackgroundReplace } from "../../../apps/api/src/routes/tools/background-replace.js";
import { processBeautify, registerBeautify } from "../../../apps/api/src/routes/tools/beautify.js";
import { registerBlurBackground } from "../../../apps/api/src/routes/tools/blur-background.js";
import { registerBlurFaces } from "../../../apps/api/src/routes/tools/blur-faces.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerChartMaker } from "../../../apps/api/src/routes/tools/chart-maker.js";
import { registerCircleCrop } from "../../../apps/api/src/routes/tools/circle-crop.js";
import { registerColorBlindness } from "../../../apps/api/src/routes/tools/color-blindness.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerDuotone } from "../../../apps/api/src/routes/tools/duotone.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerGifWebp } from "../../../apps/api/src/routes/tools/gif-webp.js";
import { registerHistogram } from "../../../apps/api/src/routes/tools/histogram.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerImagePad } from "../../../apps/api/src/routes/tools/image-pad.js";
import { registerImagesToVideo } from "../../../apps/api/src/routes/tools/images-to-video.js";
import { registerLqipPlaceholder } from "../../../apps/api/src/routes/tools/lqip-placeholder.js";
import { registerMemeGenerator } from "../../../apps/api/src/routes/tools/meme-generator.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerOcr } from "../../../apps/api/src/routes/tools/ocr.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerPixelate } from "../../../apps/api/src/routes/tools/pixelate.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";
import { registerRemoveGifBackground } from "../../../apps/api/src/routes/tools/remove-gif-background.js";
import { registerReplaceColor } from "../../../apps/api/src/routes/tools/replace-color.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerRoundedCrop } from "../../../apps/api/src/routes/tools/rounded-crop.js";
import { registerSharpening } from "../../../apps/api/src/routes/tools/sharpening.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { registerSpriteSheet } from "../../../apps/api/src/routes/tools/sprite-sheet.js";
import { registerStripMetadata } from "../../../apps/api/src/routes/tools/strip-metadata.js";
import { registerTextOverlay } from "../../../apps/api/src/routes/tools/text-overlay.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../../apps/api/src/routes/tools/upscale.js";
import { registerVectorize } from "../../../apps/api/src/routes/tools/vectorize.js";
import { registerVignette } from "../../../apps/api/src/routes/tools/vignette.js";
import { registerWatermarkText } from "../../../apps/api/src/routes/tools/watermark-text.js";
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

  it("passes an InputValidationError through unchanged", async () => {
    const valErr = new InputValidationError("Only GIF and WebP inputs are supported");
    const wrapped = withImageEncodeContext(
      "GIF/WebP conversion failed",
      () => "webp",
      async () => {
        throw valErr;
      },
    );
    await expect(wrapped(input, settings, "in.png")).rejects.toBe(valErr);
  });

  it("converts V8 buffer allocation RangeError, SIGKILL, libheif OOM, and thread creation failures into DecoderOutOfMemoryError instead of a bug-kind SafeError (#3789)", async () => {
    for (const rawOom of [
      new RangeError("Array buffer allocation failed"),
      Object.assign(new Error("cjxl exited SIGKILL"), { signal: "SIGKILL" }),
      new Error("heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed"),
      Object.assign(new Error("Command failed"), {
        signal: "SIGABRT",
        stderr:
          "terminate called after throwing an instance of 'std::system_error'  what():  Resource temporarily unavailable",
      }),
      Object.assign(new Error("Command failed"), {
        stderr: "libgomp: Thread creation failed: Resource temporarily unavailable",
      }),
    ]) {
      const wrapped = withImageEncodeContext(
        "Image conversion failed",
        (s: Settings) => s.format,
        async () => {
          throw rawOom;
        },
      );
      await expect(wrapped(input, settings, "in.png")).rejects.toMatchObject({
        name: "DecoderOutOfMemoryError",
        kind: "operational",
        code: "ENGINE_UNAVAILABLE",
        statusCode: 503,
        cause: rawOom,
      });
    }

    // Non-OOM RangeError is still wrapped as a bug-kind SafeError
    const nonOomRange = new RangeError("Invalid parameter");
    const wrappedNonOom = withImageEncodeContext(
      "Image conversion failed",
      (s: Settings) => s.format,
      async () => {
        throw nonOomRange;
      },
    );
    await expect(wrappedNonOom(input, settings, "in.png")).rejects.toMatchObject({
      name: "SafeError",
      message: "Image conversion failed",
      kind: "bug",
      code: "webp",
      cause: nonOomRange,
    });
  });
});

describe("withImageEncodeContextV2", () => {
  const ctx = {
    inputs: [{ buffer: input, filename: "in.png", ref: "r" }],
    settings,
    scratchDir: "/tmp",
    signal: new AbortController().signal,
    report: () => undefined,
  };

  it("wraps an opaque encode failure in a SafeError with the code from ctx.settings", async () => {
    const sharpErr = new Error("");
    const wrapped = withImageEncodeContextV2<Settings>(
      "Histogram generation failed",
      (s) => s.format,
      async () => {
        throw sharpErr;
      },
    );
    const caught = await wrapped(ctx).catch((e: unknown) => e);
    expect(caught).toMatchObject({
      name: "SafeError",
      message: "Histogram generation failed",
      kind: "bug",
      code: "webp",
      cause: sharpErr,
    });
  });

  it("passes SafeError, ToolInputError, InputValidationError, and binary spawn failures through unchanged", async () => {
    const safe = new SafeError("Process killed", { kind: "operational" });
    const inputErr = markToolInputError(new Error("Bad input"));
    const valErr = new InputValidationError("Provide at least two images");
    const spawnErr = Object.assign(new Error("spawn ffmpeg ENOENT"), {
      code: "ENOENT",
      syscall: "spawn ffmpeg",
      path: "ffmpeg",
    });
    for (const err of [safe, inputErr, valErr, spawnErr]) {
      const wrapped = withImageEncodeContextV2(
        "Failed",
        () => "v2",
        async () => {
          throw err;
        },
      );
      await expect(wrapped(ctx)).rejects.toBe(err);
    }

    const v8Oom = new RangeError("Array buffer allocation failed");
    const wrappedOom = withImageEncodeContextV2(
      "Failed",
      () => "v2",
      async () => {
        throw v8Oom;
      },
    );
    await expect(wrappedOom(ctx)).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      kind: "operational",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      cause: v8Oom,
    });
  });
});

describe("withAiImageEncodeContext", () => {
  const jobData = {
    jobId: "j1",
    toolId: "upscale",
    userId: null,
    pool: "ai" as const,
    inputRefs: ["r1"],
    filename: "in.png",
    settings,
    kind: "ai-tool" as const,
  };
  const aiCtx = {
    scratchDir: "/tmp",
    signal: new AbortController().signal,
    report: () => undefined,
  };

  it("wraps an opaque encode failure in a SafeError with the code from data.settings", async () => {
    const sharpErr = new Error("");
    const wrapped = withAiImageEncodeContext<Settings>(
      "Image upscaling failed",
      (s) => s.format,
      async () => {
        throw sharpErr;
      },
    );
    const caught = await wrapped(input, jobData, aiCtx).catch((e: unknown) => e);
    expect(caught).toMatchObject({
      name: "SafeError",
      message: "Image upscaling failed",
      kind: "bug",
      code: "webp",
      cause: sharpErr,
    });
  });

  it("passes AbortError, AnimatedRemovalCanceledError, Canceled, 400 status, and binary spawn errors through unchanged", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const animCanceled = Object.assign(new Error("canceled"), {
      name: "AnimatedRemovalCanceledError",
    });
    const canceledErr = new Error("Canceled");
    const timeoutErr = new Error("Timed out after 10s");
    const status400Err = Object.assign(new Error("SVG exceeds limit"), { statusCode: 400 });
    const spawnErr = Object.assign(new Error("spawn python3 ENOMEM"), {
      code: "ENOMEM",
      syscall: "spawn python3",
      path: "python3",
    });

    for (const err of [
      abortErr,
      animCanceled,
      canceledErr,
      timeoutErr,
      status400Err,
      spawnErr,
      "timeout",
    ]) {
      const wrapped = withAiImageEncodeContext(
        "Failed",
        () => "ai",
        async () => {
          throw err;
        },
      );
      await expect(wrapped(input, jobData, aiCtx)).rejects.toBe(err);
    }

    const sigkillErr = Object.assign(new Error("sidecar exited SIGKILL"), { signal: "SIGKILL" });
    const wrappedOom = withAiImageEncodeContext(
      "Failed",
      () => "ai",
      async () => {
        throw sigkillErr;
      },
    );
    await expect(wrappedOom(input, jobData, aiCtx)).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      kind: "operational",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      cause: sigkillErr,
    });
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
    // A missing file on open/read can be our own wrong path: the same line
    // error-report.ts draws by keeping non-spawn ENOENT out of the operational set.
    [
      "a missing file on open (ENOENT)",
      Object.assign(new Error("ENOENT: no such file or directory, open '/tmp/x.png'"), {
        code: "ENOENT",
        syscall: "open",
      }),
    ],
    [
      "a bare ENOENT without a spawn syscall",
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

  it.each([
    ["ENOENT", "spawn heif-enc"],
    ["ENOMEM", "spawn"],
    ["EACCES", "spawn /usr/bin/magick"],
    ["ENOEXEC", "spawn cjxl"],
    ["ENOTDIR", "spawnSync opj_compress"],
  ])(
    "passes a binary spawn failure (%s, %s) through unchanged so worker.ts converts it to 503 ENGINE_UNAVAILABLE (#3360)",
    async (code, syscall) => {
      const spawnErr = Object.assign(new Error(`${syscall} ${code}`), {
        code,
        syscall,
        path: "heif-enc",
      });

      await expect(failingWith(spawnErr)(input, settings, "in.png")).rejects.toBe(spawnErr);
    },
  );

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

  it("convert's HEIC path surfaces a real heif-enc spawn ENOENT as a 503 ENGINE_UNAVAILABLE DecoderUnavailableError (#3360, #3784)", async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = "";
    try {
      registerConvert({
        post: () => undefined,
        get: () => undefined,
      } as unknown as FastifyInstance);
      const convert = getToolConfig("convert");
      const thrown = await convert
        ?.process(readFixture(fixtures.image.base.png200), { format: "heic" }, "in.png")
        .catch((e: unknown) => e);

      expect(isSafeMessageError(thrown)).toBe(true);
      expect(thrown).toMatchObject({
        name: "DecoderUnavailableError",
        kind: "operational",
        code: "ENGINE_UNAVAILABLE",
        statusCode: 503,
        cause: expect.objectContaining({
          code: "ENOENT",
          syscall: "spawn heif-enc",
        }),
      });
      expect(classifyError(thrown, "worker")).toBe("operational");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
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
    expect(err.cause).toBe(sharpErr);
  });

  it("logs the probe's libvips reason as a string, since pino serializes only the err key", async () => {
    // pino turns an Error under any other key into `{}`, which hid the reason.
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    try {
      const sharpErr = new Error("VipsJpeg: premature end of JPEG image");
      await asInputErrorIfUndecodable(truncatedJpg, sharpErr);
      expect(info).toHaveBeenCalledTimes(1);
      const [fields, message] = info.mock.calls[0] as unknown as [
        { err: unknown; probeErr: unknown },
        string,
      ];
      expect(message).toBe("undecodable image input rejected");
      expect(fields.err).toBe(sharpErr);
      expect(typeof fields.probeErr).toBe("string");
      expect(fields.probeErr).not.toBe("");
    } finally {
      info.mockRestore();
    }
  });

  it("classifies a multi-frame GIF with corrupt frame 2 data as ToolInputError", async () => {
    const raw1 = Buffer.alloc(32 * 32 * 3, 100);
    const raw2 = Buffer.alloc(32 * 32 * 3);
    for (let i = 0; i < raw2.length; i++) raw2[i] = (i * 37) % 256;
    const f1 = await sharp(raw1, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const f2 = await sharp(raw2, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const gif = await sharp([f1, f2], { join: { across: 1, animated: true } })
      .gif({ delay: [100, 100] })
      .toBuffer();
    const corruptGif = Buffer.from(gif);
    for (let i = corruptGif.length - 100; i < corruptGif.length - 2; i++) corruptGif[i] = 0xff;

    const sharpErr = new Error("gifload_buffer: Invalid frame data");
    const err = await asInputErrorIfUndecodable(corruptGif, sharpErr);
    expect(isToolInputError(err)).toBe(true);
    expect(err.message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    expect(err.cause).toBe(sharpErr);
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
    expect(err.cause).toBe(sharpErr);
  });

  it("passes through already-classified errors and operational errnos without reclassifying", async () => {
    const safe = new SafeError("Process killed (out of memory)", { kind: "operational" });
    expect(await asInputErrorIfUndecodable(truncatedJpg, safe)).toBe(safe);

    const inputErr = markToolInputError(new Error("Unsupported input"));
    expect(await asInputErrorIfUndecodable(truncatedJpg, inputErr)).toBe(inputErr);

    const enospc = Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    expect(await asInputErrorIfUndecodable(truncatedJpg, enospc)).toBe(enospc);

    for (const [code, syscall] of [
      ["ENOENT", "spawn heif-enc"],
      ["ENOMEM", "spawn"],
      ["EACCES", "spawn /usr/bin/magick"],
    ] as const) {
      const spawnErr = Object.assign(new Error(`${syscall} ${code}`), {
        code,
        syscall,
        path: "heif-enc",
      });
      expect(await asInputErrorIfUndecodable(truncatedJpg, spawnErr)).toBe(spawnErr);
    }
  });

  it("converts OOM errors passed in or thrown during the Sharp fallback probe into DecoderOutOfMemoryError (#3632)", async () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    const classifiedDirect = await asInputErrorIfUndecodable(truncatedJpg, v8Oom);
    expect(classifiedDirect).toMatchObject({
      name: "DecoderOutOfMemoryError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: v8Oom,
    });
    expect(isToolInputError(classifiedDirect)).toBe(false);

    const sigkillOom = Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" });
    const classifiedSigkill = await asInputErrorIfUndecodable(truncatedJpg, sigkillOom);
    expect(classifiedSigkill).toMatchObject({
      name: "DecoderOutOfMemoryError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: sigkillOom,
    });

    const libheifOom = new Error(
      "heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed",
    );
    const classifiedLibheif = await asInputErrorIfUndecodable(truncatedJpg, libheifOom);
    expect(classifiedLibheif).toMatchObject({
      name: "DecoderOutOfMemoryError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: libheifOom,
    });
    expect(isToolInputError(classifiedLibheif)).toBe(false);

    const decodable = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    for (const probeOom of [
      new RangeError("Array buffer allocation failed"),
      new Error("heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed"),
    ]) {
      const rawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
        this: sharp.Sharp,
      ) {
        return {
          toBuffer: async () => {
            throw probeOom;
          },
        } as unknown as sharp.Sharp;
      });
      try {
        const classifiedProbe = await asInputErrorIfUndecodable(
          decodable,
          new Error("downstream decode failure"),
        );
        expect(classifiedProbe).toMatchObject({
          name: "DecoderOutOfMemoryError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: probeOom,
        });
        expect(isToolInputError(classifiedProbe)).toBe(false);
      } finally {
        rawSpy.mockRestore();
      }
    }
  });
});

describe("Image tool registry undecodable input & encode context guards (#949)", () => {
  const truncatedJpg = readFixture(fixtures.image.hostile.truncated);
  const truncatedGifHeader = Buffer.from("GIF89a\x10\x00\x10\x00");
  const validPng = readFixture(fixtures.image.base.png200);
  const stubApp = {
    post: () => undefined,
    get: () => undefined,
  } as unknown as FastifyInstance;

  for (const reg of [
    registerResize,
    registerCompress,
    registerCrop,
    registerRotate,
    registerColorAdjustments,
    registerSharpening,
    registerColorBlindness,
    registerGifWebp,
    registerOptimizeForWeb,
    registerPixelate,
    registerSmartCrop,
    registerReplaceColor,
    registerCircleCrop,
    registerRoundedCrop,
    registerBorder,
    registerDuotone,
    registerImagePad,
    registerVignette,
    registerTextOverlay,
    registerWatermarkText,
    registerLqipPlaceholder,
    registerHistogram,
    registerSpriteSheet,
    registerSplit,
    registerMemeGenerator,
    registerBeautify,
    registerVectorize,
    registerImagesToVideo,
    registerChartMaker,
    registerConvert,
    registerGifTools,
    registerImageEnhancement,
    registerStripMetadata,
    registerTransparencyFixer,
    registerUpscale,
    registerRestorePhoto,
    registerBlurFaces,
    registerColorize,
    registerAiCanvasExpand,
    registerPassportPhoto,
    registerContentAwareResize,
    registerRemoveBackground,
    registerRemoveGifBackground,
    registerEnhanceFaces,
    registerNoiseRemoval,
    registerRedEyeRemoval,
    registerOcr,
  ]) {
    reg(stubApp);
  }
  void registerBackgroundReplace;
  void registerBlurBackground;
  void registerEraseObject;

  const TRUNCATED_CASES: Array<{
    toolId: string;
    settings?: Record<string, unknown>;
    filename?: string;
    inputBuffer?: Buffer;
    extraInputs?: Array<{ buffer: Buffer; filename: string; ref: string }>;
  }> = [
    { toolId: "resize", settings: { width: 64 } },
    { toolId: "compress", settings: { mode: "quality", quality: 80 } },
    { toolId: "crop", settings: { left: 0, top: 0, width: 10, height: 10 } },
    { toolId: "rotate", settings: { angle: 90 } },
    { toolId: "rotate", settings: { angle: 0 } },
    { toolId: "adjust-colors", settings: { brightness: 10 } },
    { toolId: "brightness-contrast", settings: { brightness: 10 } },
    { toolId: "saturation", settings: { saturation: 10 } },
    { toolId: "color-channels", settings: { red: 120 } },
    { toolId: "color-effects", settings: { effect: "grayscale" } },
    { toolId: "sharpening", settings: {} },
    { toolId: "color-blindness", settings: {} },
    {
      toolId: "gif-webp",
      settings: {},
      filename: "truncated.gif",
      inputBuffer: truncatedGifHeader,
    },
    { toolId: "optimize-for-web", settings: {} },
    { toolId: "pixelate", settings: {} },
    { toolId: "smart-crop", settings: { mode: "subject" } },
    { toolId: "smart-crop", settings: { mode: "trim" } },
    { toolId: "smart-crop", settings: { mode: "face" } },
    { toolId: "replace-color", settings: {} },
    { toolId: "circle-crop", settings: {} },
    { toolId: "rounded-crop", settings: {} },
    { toolId: "border", settings: {} },
    { toolId: "duotone", settings: {} },
    { toolId: "image-pad", settings: {} },
    { toolId: "vignette", settings: {} },
    { toolId: "text-overlay", settings: { text: "Hello" } },
    { toolId: "watermark-text", settings: { text: "Watermark" } },
    { toolId: "lqip-placeholder", settings: { strategy: "blur" } },
    { toolId: "lqip-placeholder", settings: { strategy: "solid" } },
    { toolId: "histogram", settings: {} },
    {
      toolId: "sprite-sheet",
      settings: {},
      extraInputs: [{ buffer: validPng, filename: "b.png", ref: "r2" }],
    },
    { toolId: "split", settings: { columns: 2, rows: 2 } },
    { toolId: "meme-generator", settings: { textBoxes: [{ id: "top", text: "HI" }] } },
    { toolId: "beautify", settings: {} },
    { toolId: "vectorize", settings: {} },
    {
      toolId: "images-to-video",
      settings: {},
      extraInputs: [{ buffer: validPng, filename: "b.png", ref: "r2" }],
    },
    { toolId: "convert", settings: { format: "png" } },
    { toolId: "convert", settings: { format: "bmp" } },
    { toolId: "convert", settings: { format: "psd" } },
    { toolId: "convert", settings: { format: "heic" } },
    { toolId: "gif-tools", settings: { mode: "resize", width: 32 }, filename: "truncated.gif" },
    {
      toolId: "gif-tools",
      settings: { mode: "resize", width: 32 },
      filename: "truncated.gif",
      inputBuffer: truncatedGifHeader,
    },
    { toolId: "image-enhancement", settings: {} },
    { toolId: "strip-metadata", settings: { stripAll: true } },
    { toolId: "transparency-fixer", settings: { removeWatermark: true } },
    { toolId: "transparency-fixer", settings: { removeWatermark: false } },
    { toolId: "upscale", settings: { scale: 2 } },
    { toolId: "restore-photo", settings: {} },
    { toolId: "blur-faces", settings: {} },
    { toolId: "colorize", settings: {} },
    { toolId: "ai-canvas-expand", settings: { extendRight: 16 } },
    { toolId: "passport-photo", settings: { countryCode: "US" } },
    { toolId: "content-aware-resize", settings: { width: 50 } },
    { toolId: "remove-background", settings: {} },
    {
      toolId: "remove-gif-background",
      settings: {},
      filename: "truncated.gif",
      inputBuffer: truncatedGifHeader,
    },
    { toolId: "enhance-faces", settings: {} },
    { toolId: "noise-removal", settings: {} },
    { toolId: "red-eye-removal", settings: {} },
    { toolId: "ocr", settings: { quality: "fast" } },
  ];

  it.each(TRUNCATED_CASES)(
    "$toolId classifies truncated input as ToolInputError ($settings)",
    async ({
      toolId,
      settings: rawSettings = {},
      filename = "truncated.jpg",
      inputBuffer = truncatedJpg,
      extraInputs = [],
    }) => {
      const config = getToolConfig(toolId);
      if (!config?.processV2) throw new Error(`${toolId} missing from toolRegistry`);
      const parsedSettings = config.settingsSchema.parse(rawSettings);
      const err = await config
        .processV2({
          inputs: [{ buffer: inputBuffer, filename, ref: "r1" }, ...extraInputs],
          settings: parsedSettings,
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        })
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(isToolInputError(err)).toBe(true);
      expect((err as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    },
  );

  it.each(["sprite-sheet", "images-to-video"])(
    "%s classifies a truncated second input as ToolInputError (not only input[0])",
    async (toolId) => {
      const config = getToolConfig(toolId);
      if (!config?.processV2) throw new Error(`${toolId} missing from toolRegistry`);
      const parsedSettings = config.settingsSchema.parse({});
      const err = await config
        .processV2({
          inputs: [
            { buffer: validPng, filename: "a.png", ref: "r1" },
            { buffer: truncatedJpg, filename: "truncated.jpg", ref: "r2" },
          ],
          settings: parsedSettings,
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        })
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(isToolInputError(err)).toBe(true);
      expect((err as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    },
  );

  it.each([
    { toolId: "transparency-fixer", settings: { removeWatermark: true } },
    { toolId: "transparency-fixer", settings: { removeWatermark: false } },
    { toolId: "upscale", settings: { scale: 2 } },
    { toolId: "restore-photo", settings: {} },
    { toolId: "blur-faces", settings: {} },
    { toolId: "colorize", settings: {} },
    { toolId: "ai-canvas-expand", settings: { extendRight: 16 } },
    { toolId: "background-replace", settings: {} },
    { toolId: "blur-background", settings: {} },
    { toolId: "remove-background", settings: {} },
    {
      toolId: "remove-gif-background",
      settings: {},
      filename: "truncated.gif",
      inputBuffer: truncatedGifHeader,
    },
    { toolId: "enhance-faces", settings: {} },
    { toolId: "noise-removal", settings: {} },
    { toolId: "red-eye-removal", settings: {} },
    { toolId: "ocr", settings: { quality: "fast" } },
  ])(
    "AI job handler $toolId classifies truncated input as ToolInputError",
    async ({
      toolId,
      settings: rawSettings,
      filename = "truncated.jpg",
      inputBuffer = truncatedJpg,
    }: {
      toolId: string;
      settings: Record<string, unknown>;
      filename?: string;
      inputBuffer?: Buffer;
    }) => {
      const err = await runAiToolJob(
        {
          jobId: "test-job",
          toolId,
          userId: null,
          pool: "ai",
          inputRefs: [`uploads/test-job/${filename}`],
          filename,
          settings: rawSettings,
          kind: "ai-tool",
        },
        inputBuffer,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => null,
        (e: unknown) => e,
      );

      expect(isToolInputError(err)).toBe(true);
      expect((err as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    },
  );

  it("erase-object AI job handler classifies both a truncated main image and a truncated mask as ToolInputError", async () => {
    const maskKeyValid = "uploads/test-erase-job/mask-valid.png";
    const maskKeyTrunc = "uploads/test-erase-job/mask-trunc.jpg";
    await putObject(maskKeyValid, validPng);
    await putObject(maskKeyTrunc, truncatedJpg);

    // 1. Truncated main image + valid mask
    const errMain = await runAiToolJob(
      {
        jobId: "test-erase-1",
        toolId: "erase-object",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/test-erase-job/in.jpg", maskKeyValid],
        filename: "truncated.jpg",
        settings: {},
        kind: "ai-tool",
      },
      truncatedJpg,
      {
        scratchDir: tmpdir(),
        signal: new AbortController().signal,
        report: () => undefined,
      },
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isToolInputError(errMain)).toBe(true);
    expect((errMain as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);

    // 2. Valid main image + truncated mask
    const errMask = await runAiToolJob(
      {
        jobId: "test-erase-2",
        toolId: "erase-object",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/test-erase-job/in.png", maskKeyTrunc],
        filename: "valid.png",
        settings: {},
        kind: "ai-tool",
      },
      validPng,
      {
        scratchDir: tmpdir(),
        signal: new AbortController().signal,
        report: () => undefined,
      },
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isToolInputError(errMask)).toBe(true);
    expect((errMask as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
  });

  it("beautify classifies a truncated backgroundImage as ToolInputError when main image is valid", async () => {
    const config = getToolConfig("beautify");
    if (!config) throw new Error("beautify missing from toolRegistry");
    const settings = config.settingsSchema.parse({ backgroundType: "image" });
    const err = await processBeautify(
      validPng,
      settings as Parameters<typeof processBeautify>[1],
      "valid.png",
      truncatedJpg,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isToolInputError(err)).toBe(true);
    expect((err as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
  });

  it("adjust-colors (with sharpness > 0) and image-enhancement classify a multi-frame GIF with corrupt frame 2 as ToolInputError", async () => {
    const raw1 = Buffer.alloc(32 * 32 * 3, 100);
    const raw2 = Buffer.alloc(32 * 32 * 3);
    for (let i = 0; i < raw2.length; i++) raw2[i] = (i * 37) % 256;
    const f1 = await sharp(raw1, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const f2 = await sharp(raw2, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const gif = await sharp([f1, f2], { join: { across: 1, animated: true } })
      .gif({ delay: [100, 100] })
      .toBuffer();
    const corruptGif = Buffer.from(gif);
    for (let i = corruptGif.length - 100; i < corruptGif.length - 2; i++) corruptGif[i] = 0xff;

    for (const [toolId, rawSettings] of [
      ["adjust-colors", { sharpness: 20 }],
      ["image-enhancement", {}],
      ["gif-tools", { mode: "resize", width: 16 }],
    ] as const) {
      const config = getToolConfig(toolId);
      if (!config?.processV2) throw new Error(`${toolId} missing from toolRegistry`);
      const parsed = config.settingsSchema.parse(rawSettings);
      const err = await config
        .processV2({
          inputs: [{ buffer: corruptGif, filename: "corrupt.gif", ref: "r1" }],
          settings: parsed,
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(isToolInputError(err), `${toolId} did not classify corruptGif`).toBe(true);
      expect((err as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    }
  });

  it("content-aware-resize classifies bomb PNG as PIXEL_LIMIT_IMAGE_MESSAGE and missing caire binary as 503 ENGINE_UNAVAILABLE (#3858)", async () => {
    const bombPng = readFixture(fixtures.image.hostile.bomb);
    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize missing from toolRegistry");
    const bombErr = await config.process(bombPng, { width: 100 }, "bomb.png").then(
      () => null,
      (e: unknown) => e,
    );

    expect(isToolInputError(bombErr)).toBe(true);
    expect((bombErr as Error).message).toBe(PIXEL_LIMIT_IMAGE_MESSAGE);

    const prevPath = process.env.PATH;
    const prevCaire = process.env.CAIRE_PATH;
    process.env.PATH = "";
    process.env.CAIRE_PATH = "/nonexistent-caire-binary";
    try {
      const caireErr = await config.process(validPng, { width: 100 }, "valid.png").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(caireErr)).toBe(true);
      expect((caireErr as SafeError).kind).toBe("operational");
      expect((caireErr as SafeError).code).toBe("ENGINE_UNAVAILABLE");
      expect((caireErr as SafeError).statusCode).toBe(503);
      expect((caireErr as SafeError).message).toContain("caire binary not found");
    } finally {
      process.env.PATH = prevPath;
      if (prevCaire === undefined) delete process.env.CAIRE_PATH;
      else process.env.CAIRE_PATH = prevCaire;
    }
  });

  it("passport-photo registry process rejects unknown countryCode or documentType as ToolInputError", async () => {
    const config = getToolConfig("passport-photo");
    if (!config) throw new Error("passport-photo missing from toolRegistry");
    const badCountry = await config
      .process(validPng, { countryCode: "ZZ", documentType: "passport" }, "valid.png")
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isToolInputError(badCountry)).toBe(true);
    expect((badCountry as Error).message).toBe("Unknown country code: ZZ");

    const badDoc = await config
      .process(validPng, { countryCode: "US", documentType: "nonexistent" }, "valid.png")
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isToolInputError(badDoc)).toBe(true);
    expect((badDoc as Error).message).toBe("No nonexistent spec for US");
  });

  it("surfaces non-input process failures as titled SafeError bugs across wrapped tools", async () => {
    // Calling process/processV2 with invalid settings or non-image bytes that
    // fail outside the input-decode guard verifies withImageEncodeContext is wired.
    for (const [toolId, badSettings, expectedTitle] of [
      ["optimize-for-web", { format: "invalid" }, "Web optimization failed"],
      ["sharpening", { method: "invalid" }, "Image sharpening failed"],
      ["convert", { format: "invalid" }, "Image conversion failed"],
      ["gif-tools", { mode: "optimize", effort: 99 }, "GIF processing failed"],
    ] as const) {
      const config = getToolConfig(toolId);
      if (!config) throw new Error(`${toolId} missing from toolRegistry`);
      const err = await config.process(validPng, badSettings, "valid.png").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err), `${toolId} did not wrap in SafeError`).toBe(true);
      expect((err as SafeError).message).toBe(expectedTitle);
      expect((err as SafeError).kind).toBe("bug");
    }

    // Tools whose leading metadata() sits before the pixel-decode try/catch
    // surface non-image bytes as titled SafeErrors when intake is bypassed.
    const garbage = Buffer.from("not an image");
    for (const [toolId, rawSettings, expectedTitle] of [
      ["resize", { width: 64 }, "Image resize failed"],
      ["crop", { left: 0, top: 0, width: 10, height: 10 }, "Image crop failed"],
      ["circle-crop", {}, "Circle crop failed"],
      ["rounded-crop", {}, "Rounded crop failed"],
      ["duotone", {}, "Duotone failed"],
      ["strip-metadata", { stripAll: true }, "Metadata strip failed"],
    ] as const) {
      const config = getToolConfig(toolId);
      if (!config) throw new Error(`${toolId} missing from toolRegistry`);
      const parsed = config.settingsSchema.parse(rawSettings);
      const err = await config.process(garbage, parsed, "garbage.bin").then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err), `${toolId} did not wrap in SafeError`).toBe(true);
      expect((err as SafeError).message).toBe(expectedTitle);
      expect((err as SafeError).kind).toBe("bug");
    }

    // chart-maker wraps processV2 in withImageEncodeContextV2: an unparseable
    // settings payload (e.g. width: -1) thrown inside processV2 is wrapped as
    // SafeError("Chart rendering failed", { kind: "bug" }).
    const chartConfig = getToolConfig("chart-maker");
    if (!chartConfig?.processV2) throw new Error("chart-maker missing from toolRegistry");
    const chartErr = await chartConfig
      .processV2({
        inputs: [{ buffer: Buffer.from("label,value\nA,10\n"), filename: "data.csv", ref: "r1" }],
        settings: { kind: "bar", width: -1 },
        scratchDir: tmpdir(),
        signal: new AbortController().signal,
        report: () => undefined,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isSafeMessageError(chartErr)).toBe(true);
    expect((chartErr as SafeError).message).toBe("Chart rendering failed");
    expect((chartErr as SafeError).kind).toBe("bug");
  });

  it("remove-gif-background AI job handler classifies a missing local bgImageKey as a 410 INPUT_MISSING operational SafeError (#3478)", async () => {
    const err = await runAiToolJob(
      {
        jobId: "test-gif-missing-bg",
        toolId: "remove-gif-background",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/test-gif-missing-bg/in.gif"],
        filename: "in.gif",
        settings: {
          backgroundType: "image",
          bgImageKey: "uploads/test-gif-missing-bg/bg-does-not-exist.png",
        },
        kind: "ai-tool",
      },
      validPng,
      {
        scratchDir: tmpdir(),
        signal: new AbortController().signal,
        report: () => undefined,
      },
    ).catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      message: "Input file is no longer available. Upload it again.",
    });
    expect(classifyError(err, "worker")).toBe("operational");

    const nonMissingLocalErr = await runAiToolJob(
      {
        jobId: "test-gif-invalid-bg",
        toolId: "remove-gif-background",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/test-gif-invalid-bg/in.gif"],
        filename: "in.gif",
        settings: {
          backgroundType: "image",
          bgImageKey: "invalid-key",
        },
        kind: "ai-tool",
      },
      validPng,
      {
        scratchDir: tmpdir(),
        signal: new AbortController().signal,
        report: () => undefined,
      },
    ).catch((e: unknown) => e);

    expect(nonMissingLocalErr).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "bug",
      code: "webp",
      message: "Animated background removal failed",
    });
    expect(classifyError(nonMissingLocalErr, "worker")).toBe("bug");
  });

  it("rethrows DecoderOutOfMemoryError from asInputErrorIfUndecodable in erase-object and remove-gif-background (#3805)", async () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    const validGif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .gif()
      .toBuffer();
    const sidecarBug = new SafeError("sidecar failed", { kind: "bug" });
    const origRaw = sharp.prototype.raw;

    // 1. erase-object AI job handler:
    //    (a) inpaint fails on truncated mask while the 1x1 Sharp probe on input hits V8 OOM
    //    (b) input probe succeeds and the 1x1 Sharp probe on maskBuffer hits V8 OOM
    const maskKeyTrunc = "uploads/test-erase-oom/mask-trunc.jpg";
    await putObject(maskKeyTrunc, truncatedJpg);
    const eraseRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw v8Oom;
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const eraseErr = await runAiToolJob(
        {
          jobId: "test-erase-oom",
          toolId: "erase-object",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/test-erase-oom/in.png", maskKeyTrunc],
          filename: "valid.png",
          settings: {},
          kind: "ai-tool",
        },
        validPng,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );

      expect(eraseErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      eraseRawSpy.mockRestore();
    }

    let eraseMaskRawCalls = 0;
    const eraseMaskRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementation(function (
      this: sharp.Sharp,
    ) {
      eraseMaskRawCalls++;
      if (eraseMaskRawCalls === 2) {
        return {
          toBuffer: async () => {
            throw v8Oom;
          },
        } as unknown as sharp.Sharp;
      }
      return origRaw.call(this);
    });
    try {
      const eraseMaskOomErr = await runAiToolJob(
        {
          jobId: "test-erase-mask-oom",
          toolId: "erase-object",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/test-erase-oom/in.png", maskKeyTrunc],
          filename: "valid.png",
          settings: {},
          kind: "ai-tool",
        },
        validPng,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );

      expect(eraseMaskOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      eraseMaskRawSpy.mockRestore();
    }

    // 2. remove-gif-background AI job handler:
    //    (a) 1x1 probe of input hits V8 OOM after a bug-kind SafeError
    //    (b) 1x1 probe of bgBuffer hits V8 OOM when input probe succeeds
    //    (c) detectAnimation itself throws V8 OOM (probeCandidate is OOM)
    const bgKeyValid = "uploads/test-gif-oom/bg.png";
    await putObject(bgKeyValid, validPng);

    const gifInputMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(sidecarBug);
    const gifInputRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw v8Oom;
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const gifInputOomErr = await runAiToolJob(
        {
          jobId: "test-gif-input-oom",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/test-gif-oom/in.gif"],
          filename: "anim.gif",
          settings: {},
          kind: "ai-tool",
        },
        validGif,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );

      expect(gifInputOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      gifInputRawSpy.mockRestore();
      gifInputMetaSpy.mockRestore();
    }

    let rawCalls = 0;
    const gifBgMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(sidecarBug);
    const gifBgRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementation(function (
      this: sharp.Sharp,
    ) {
      rawCalls++;
      if (rawCalls === 2) {
        return {
          toBuffer: async () => {
            throw v8Oom;
          },
        } as unknown as sharp.Sharp;
      }
      return origRaw.call(this);
    });
    try {
      const gifBgOomErr = await runAiToolJob(
        {
          jobId: "test-gif-bg-oom",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/test-gif-oom/in.gif"],
          filename: "anim.gif",
          settings: {
            backgroundType: "image",
            bgImageKey: bgKeyValid,
          },
          kind: "ai-tool",
        },
        validGif,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );

      expect(gifBgOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      gifBgRawSpy.mockRestore();
      gifBgMetaSpy.mockRestore();
    }

    const gifDirectMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(v8Oom);
    try {
      const gifDirectOomErr = await runAiToolJob(
        {
          jobId: "test-gif-direct-oom",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/test-gif-oom/in.gif"],
          filename: "anim.gif",
          settings: {},
          kind: "ai-tool",
        },
        validGif,
        {
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        },
      ).then(
        () => "resolved",
        (e: unknown) => e,
      );

      expect(gifDirectOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      gifDirectMetaSpy.mockRestore();
    }

    // 3. remove-gif-background registry processV2: 1x1 probe OOM and direct probeCandidate OOM
    const gifConfig = getToolConfig("remove-gif-background");
    if (!gifConfig?.processV2) throw new Error("remove-gif-background missing from toolRegistry");
    const parsedGifSettings = gifConfig.settingsSchema.parse({});

    const regProbeMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(sidecarBug);
    const regRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw v8Oom;
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const regProbeOomErr = await gifConfig
        .processV2({
          inputs: [{ buffer: validGif, filename: "anim.gif", ref: "r1" }],
          settings: parsedGifSettings,
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        })
        .then(
          () => "resolved",
          (e: unknown) => e,
        );

      expect(regProbeOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      regRawSpy.mockRestore();
      regProbeMetaSpy.mockRestore();
    }

    const regMetaSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(v8Oom);
    try {
      const regDirectOomErr = await gifConfig
        .processV2({
          inputs: [{ buffer: validGif, filename: "anim.gif", ref: "r1" }],
          settings: parsedGifSettings,
          scratchDir: tmpdir(),
          signal: new AbortController().signal,
          report: () => undefined,
        })
        .then(
          () => "resolved",
          (e: unknown) => e,
        );

      expect(regDirectOomErr).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      regMetaSpy.mockRestore();
    }

    // 4. gif-tools process and preValidate: inspectGifWorkload classifies V8 OOM,
    //    operational errnos, pixel limits, and undecodable animated metadata (#3859)
    const gifToolsConfig = getToolConfig("gif-tools");
    if (!gifToolsConfig?.preValidate) throw new Error("gif-tools missing from toolRegistry");
    const parsedGifToolsSettings = gifToolsConfig.settingsSchema.parse({
      mode: "resize",
      width: 16,
    });

    const gifToolsOomSpy = vi.spyOn(sharp.prototype, "metadata").mockRejectedValueOnce(v8Oom);
    try {
      const gifToolsProcOom = await gifToolsConfig
        .process(validGif, parsedGifToolsSettings, "anim.gif")
        .then(
          () => "resolved",
          (e: unknown) => e,
        );
      expect(gifToolsProcOom).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      gifToolsOomSpy.mockRestore();
    }

    const gifToolsProbeMetaSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(new Error("gifload_buffer: Invalid GIF header"));
    const gifToolsProbeRawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw v8Oom;
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const gifToolsProbeOom = await gifToolsConfig
        .process(validGif, parsedGifToolsSettings, "anim.gif")
        .then(
          () => "resolved",
          (e: unknown) => e,
        );
      expect(gifToolsProbeOom).toMatchObject({
        name: "DecoderOutOfMemoryError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: v8Oom,
      });
    } finally {
      gifToolsProbeRawSpy.mockRestore();
      gifToolsProbeMetaSpy.mockRestore();
    }

    const gifToolsEnospcSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }),
      );
    try {
      const gifToolsEnospc = await gifToolsConfig
        .process(validGif, parsedGifToolsSettings, "anim.gif")
        .then(
          () => "resolved",
          (e: unknown) => e,
        );
      expect(gifToolsEnospc).toMatchObject({
        name: "SafeError",
        kind: "operational",
        code: "ENOSPC",
        message: DISK_ENVIRONMENT_MESSAGE,
      });
    } finally {
      gifToolsEnospcSpy.mockRestore();
    }

    const gifToolsHeaderSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(new Error("gifload_buffer: Invalid multi-frame header"));
    try {
      const gifToolsHeaderErr = await gifToolsConfig
        .process(validGif, parsedGifToolsSettings, "anim.gif")
        .then(
          () => "resolved",
          (e: unknown) => e,
        );
      expect(isToolInputError(gifToolsHeaderErr)).toBe(true);
      expect((gifToolsHeaderErr as Error).message).toBe(UNDECODABLE_IMAGE_MESSAGE);
    } finally {
      gifToolsHeaderSpy.mockRestore();
    }
  });
});
