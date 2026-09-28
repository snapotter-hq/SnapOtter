/**
 * #795: the image decoders threw the same plain Error for "this file is
 * corrupt" and "the decoder binary is not installed", so no caller could tell
 * a bad upload from a misconfigured host. A missing or unstartable decoder now
 * surfaces as DecoderUnavailableError: a SafeError carrying 503 and
 * ENGINE_UNAVAILABLE, the contract the media and document input handlers use.
 *
 * PATH is pointed at an empty directory to simulate a host without the
 * decoder CLIs. This file runs in its own fork, so the decoders' module-level
 * command caches start empty.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSafeMessageError } from "@snapotter/shared";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  asDecoderUnavailable,
  DecoderUnavailableError,
  decodeAnyFormat,
  decodeToSharpCompat,
  isDecoderUnavailable,
  noDecoderFound,
} from "../../../apps/api/src/lib/format-decoders.js";
import { decodeHeic } from "../../../apps/api/src/lib/heic-converter.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const ORIGINAL_PATH = process.env.PATH;
const emptyBinDir = mkdtempSync(join(tmpdir(), "no-decoders-"));

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(() => {
  process.env.PATH = ORIGINAL_PATH;
  rmSync(emptyBinDir, { recursive: true, force: true });
});

function hideDecoderBinaries() {
  process.env.PATH = emptyBinDir;
}

function spawnFailure(code: string, binary: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`spawn ${binary} ${code}`), {
    code,
    errno: -2,
    syscall: `spawn ${binary}`,
    path: binary,
  });
}

describe("DecoderUnavailableError", () => {
  it("is a SafeError that renders as 503 ENGINE_UNAVAILABLE", () => {
    const err = new DecoderUnavailableError("No HEIF decoder found.");

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DecoderUnavailableError");
    expect(isSafeMessageError(err)).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("ENGINE_UNAVAILABLE");
  });
});

describe("isDecoderUnavailable", () => {
  it("recognises DecoderUnavailableError", () => {
    expect(isDecoderUnavailable(new DecoderUnavailableError("x"))).toBe(true);
  });

  it("recognises the SafeError marker when the error crossed a module boundary", () => {
    const copied = Object.assign(new Error("x"), {
      isSafeMessage: true,
      code: "ENGINE_UNAVAILABLE",
    });
    expect(isDecoderUnavailable(copied)).toBe(true);
  });

  it("is false for a raw spawn failure that was never classified", () => {
    expect(isDecoderUnavailable(spawnFailure("ENOENT", "magick"))).toBe(false);
  });

  it("is false for a decoder that ran and rejected the file", () => {
    const exitFailure = Object.assign(
      new Error("Command failed: magick ... improper image header"),
      {
        code: 1,
      },
    );
    expect(isDecoderUnavailable(exitFailure)).toBe(false);
    expect(isDecoderUnavailable(new Error("Invalid QOI header"))).toBe(false);
    expect(isDecoderUnavailable(undefined)).toBe(false);
    expect(isDecoderUnavailable("spawn failed")).toBe(false);
  });

  it("is false for a missing input file, whose ENOENT is not a spawn", () => {
    const readFailure = Object.assign(new Error("ENOENT: no such file"), {
      code: "ENOENT",
      syscall: "open",
    });
    expect(isDecoderUnavailable(readFailure)).toBe(false);
  });
});

describe("asDecoderUnavailable", () => {
  it("converts every errno of a failed spawn, keeping the spawn error as the cause", () => {
    for (const code of ["ENOENT", "EACCES", "ENOEXEC", "ENOTDIR"]) {
      const spawnErr = spawnFailure(code, "ffmpeg");
      const converted = asDecoderUnavailable(spawnErr);
      expect(converted).toBeInstanceOf(DecoderUnavailableError);
      expect((converted as Error).cause).toBe(spawnErr);
    }
  });

  it("passes an abort through unchanged", () => {
    const abort = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
      code: "ABORT_ERR",
    });
    expect(asDecoderUnavailable(abort)).toBe(abort);
  });

  it("passes a timeout through unchanged", () => {
    const timeout = Object.assign(new Error("Command failed: magick"), {
      killed: true,
      signal: "SIGTERM",
      code: null,
    });
    expect(asDecoderUnavailable(timeout)).toBe(timeout);
  });
});

describe("noDecoderFound", () => {
  it("reports the decoder as unavailable when every probe failed to spawn", () => {
    const err = noDecoderFound("No ImageMagick found.", [
      spawnFailure("ENOENT", "magick"),
      spawnFailure("ENOENT", "convert"),
    ]);
    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("stays a plain error when a probe ran but did not answer in time", () => {
    const timeout = Object.assign(new Error("Command failed: magick --version"), {
      killed: true,
      signal: "SIGTERM",
      code: null,
    });
    const err = noDecoderFound("No ImageMagick found.", [
      timeout,
      spawnFailure("ENOENT", "convert"),
    ]);
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.cause).toBe(timeout);
  });
});

describe("decodeHeic without a HEIF decoder", () => {
  it("rejects with DecoderUnavailableError", async () => {
    hideDecoderBinaries();

    const err = await decodeHeic(readFixture(fixtures.image.base.heic200)).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/No HEIF decoder found/);
  });

  // Runs after the test above on purpose: this one caches the decoder command.
  it("rejects with DecoderUnavailableError when the cached decoder can no longer be spawned", async () => {
    const heic = readFixture(fixtures.image.base.heic200);
    await decodeHeic(heic);
    hideDecoderBinaries();

    const err = await decodeHeic(heic).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(isBinarySpawnCause(err.cause)).toBe(true);
  });

  it("keeps a plain decode error for a corrupt HEIC when the decoder is installed", async () => {
    const heic = readFixture(fixtures.image.base.heic200);
    const corrupt = Buffer.concat([heic.subarray(0, 64), Buffer.alloc(4096, 0x5a)]);

    const err = await decodeHeic(corrupt).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(isDecoderUnavailable(err)).toBe(false);
  });
});

describe("decodeToSharpCompat without a decoder binary", () => {
  it("rejects with DecoderUnavailableError when ImageMagick is missing", async () => {
    hideDecoderBinaries();

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("ico")), "ico").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/No ImageMagick found/);
  });

  it("ends the RAW fallback chain in DecoderUnavailableError when no RAW decoder exists", async () => {
    hideDecoderBinaries();

    // dcraw_emu and both exiftool attempts fail to spawn and fall through;
    // the ImageMagick probe is the last word.
    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/No ImageMagick found/);
  });

  it("rejects with DecoderUnavailableError when a direct decoder cannot be spawned", async () => {
    hideDecoderBinaries();

    // EXR falls back from ImageMagick to a direct ffmpeg spawn, so with both
    // missing the spawn failure itself is what escapes.
    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(isBinarySpawnCause(err.cause)).toBe(true);
  });

  it("still rejects a corrupt file with a plain decode error when the decoder is installed", async () => {
    const err = await decodeToSharpCompat(Buffer.from("not a qoi file"), "qoi").catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/Invalid QOI header/);
    expect(err).not.toBeInstanceOf(DecoderUnavailableError);
  });

  it("surfaces a cancelled decode as an abort, not an unavailable decoder", async () => {
    const controller = new AbortController();
    const pending = decodeToSharpCompat(
      readFixture(fixtures.image.formats("ico")),
      "ico",
      undefined,
      { signal: controller.signal },
    ).catch((e) => e);
    controller.abort();

    const err = await pending;

    expect(err.name).toBe("AbortError");
    expect(isDecoderUnavailable(err)).toBe(false);
  });
});

describe("dimension preflight without exiftool (#1428)", () => {
  it("rejects with DecoderUnavailableError when safety limits need exiftool and it is missing", async () => {
    hideDecoderBinaries();

    // RAW has no header the module can read dimensions from, so the limits
    // can only be checked through exiftool.
    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
      { maxPixels: 100_000_000 },
    ).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/No exiftool found/);
  });
});

describe("decodeAnyFormat (#1428)", () => {
  // Runs after the ImageMagick tests above on purpose: this one caches the command.
  it("rejects with DecoderUnavailableError when the cached ImageMagick can no longer be spawned", async () => {
    const avif = readFixture(fixtures.image.formats("avif"));
    await decodeAnyFormat(avif, "avif");
    hideDecoderBinaries();

    const err = await decodeAnyFormat(avif, "avif").catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(isBinarySpawnCause(err.cause)).toBe(true);
  });
});

function isBinarySpawnCause(cause: unknown): boolean {
  const e = cause as NodeJS.ErrnoException | undefined;
  return typeof e?.syscall === "string" && e.syscall.startsWith("spawn");
}
