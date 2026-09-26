import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import { friendlyError } from "../../../apps/api/src/lib/errors.js";
import {
  HW_ACCEL_FAMILIES,
  hwAccelStatus,
  parseEncoderNames,
  resolveEncoder,
  setEncoderInventoryForTests,
  softwareEncoder,
  softwareEncoderStatus,
} from "../../../packages/media-engine/src/encoders.js";

/**
 * PR CI runs tests/unit and tests/integration only, never packages/ * /tests,
 * so the regression cover for #1054 has to live here to gate a merge. The
 * fuller behavioural suite is packages/media-engine/tests/encoder-availability.
 *
 * Inventories are pinned rather than probed: the CI shards have no ffmpeg, and
 * a test that reads the ambient binary would assert nothing there.
 */

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;
const ORIGINAL_FFMPEG = process.env.FFMPEG_PATH;

afterEach(() => {
  if (ORIGINAL_ACCEL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL_ACCEL;
  if (ORIGINAL_FFMPEG === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = ORIGINAL_FFMPEG;
  setEncoderInventoryForTests(undefined);
  vi.resetModules();
});

/** What the published image's static ffmpeg actually lists: QSV, no NVENC. */
const QSV_ONLY = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "aac",
  "libopus",
  "libmp3lame",
  "libvorbis",
  "libtheora",
  "libwebp_anim",
  "h264_qsv",
  "hevc_qsv",
]);

/** Every target resolveEncoder serves, in declaration order. */
const TARGETS = [
  "h264",
  "hevc",
  "av1",
  "vp9",
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "theora",
  "webp",
] as const;

const WITH_NVENC = new Set([...QSV_ONLY, "h264_nvenc", "hevc_nvenc", "av1_nvenc"]);

describe("resolveEncoder", () => {
  it("defaults to software encoders", () => {
    setEncoderInventoryForTests(QSV_ONLY);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
    expect(resolveEncoder("aac")).toBe("aac");
  });

  it("falls back to software for unknown accel values", () => {
    setEncoderInventoryForTests(QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "quantum";
    expect(resolveEncoder("h264")).toBe("libx264");
  });

  it("leaves audio on software when a video family is selected", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("aac")).toBe("aac");
    expect(resolveEncoder("opus")).toBe("libopus");
  });

  /**
   * The #1054 regression itself. Deterministic in every lane because the
   * inventory is pinned: nvenc requested against the published image's
   * encoder list must not produce `h264_nvenc`.
   */
  it("gives software when the build does not list the hardware encoder", () => {
    setEncoderInventoryForTests(QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");

    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
  });

  /** The other direction: the gate must not have simply disabled hardware. */
  it("uses the hardware encoder when the build does list it", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
    expect(resolveEncoder("hevc")).toBe("hevc_nvenc");
    expect(resolveEncoder("av1")).toBe("av1_nvenc");
  });

  it("treats an unreadable inventory as absent", () => {
    setEncoderInventoryForTests(null);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("libx264");
  });
});

/**
 * #1092: the software branch used to hand its encoder to ffmpeg unchecked. A
 * custom FFMPEG_PATH built without libx264 (Fedora's ffmpeg-free, say) then
 * died with `Unknown encoder 'libx264'`, which friendlyError collapses into
 * "the file may be corrupted" and so blames the user's file.
 */
describe("resolveEncoder on a build that lacks a software encoder (#1092)", () => {
  const NO_LIBX264 = new Set([...QSV_ONLY].filter((name) => name !== "libx264"));

  it("throws a message naming the missing encoder and the target", () => {
    setEncoderInventoryForTests(NO_LIBX264);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(() => resolveEncoder("h264")).toThrow(/libx264/);
    expect(() => resolveEncoder("h264")).toThrow(/h264/);
  });

  it("still resolves the targets the build does provide", () => {
    setEncoderInventoryForTests(NO_LIBX264);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("vp9")).toBe("libvpx-vp9");
    expect(resolveEncoder("aac")).toBe("aac");
  });

  it("throws when hardware falls back to a software encoder that is also missing", () => {
    setEncoderInventoryForTests(NO_LIBX264);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(() => resolveEncoder("h264")).toThrow(/libx264/);
  });

  it("still prefers a listed hardware encoder over a missing software one", () => {
    setEncoderInventoryForTests(new Set([...NO_LIBX264, "h264_nvenc"]));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
  });

  /**
   * The probe failing tells us nothing about the build. Failing closed here
   * would turn one unreadable `ffmpeg -encoders` into every media job failing.
   */
  it("fails open when the inventory could not be read", () => {
    setEncoderInventoryForTests(null);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("opus")).toBe("libopus");
  });

  /** Anything friendlyError rewrites would reach the user as "file may be corrupted". */
  it("throws a message friendlyError passes through unchanged", () => {
    setEncoderInventoryForTests(new Set<string>(["aac"]));
    delete process.env.SNAPOTTER_HW_ACCEL;
    for (const target of TARGETS.filter((t) => t !== "aac")) {
      let message = "";
      try {
        resolveEncoder(target);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toBe("");
      expect(friendlyError(message)).toBe(message);
    }
  });

  /** The host's ffmpeg is at fault, so error reporting must not file it as our bug. */
  it("throws an operational error, not a bug", () => {
    setEncoderInventoryForTests(NO_LIBX264);
    delete process.env.SNAPOTTER_HW_ACCEL;
    let thrown: unknown;
    try {
      resolveEncoder("h264");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ code: "ENCODER_MISSING" });
    expect(classifyError(thrown, "worker")).toBe("operational");
  });
});

/**
 * For command lines whose options only the software encoder accepts, like
 * file-preview's libx264 `-preset ultrafast`, which NVENC rejects (#1270).
 */
describe("softwareEncoder", () => {
  it("never swaps in a hardware encoder, even one the build lists", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
    expect(softwareEncoder("h264")).toBe("libx264");
  });

  it("names a software encoder the build lacks", () => {
    setEncoderInventoryForTests(new Set([...WITH_NVENC].filter((n) => n !== "libx264")));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(() => softwareEncoder("h264")).toThrow(/has no libx264 encoder/);
  });

  it("fails open when the encoder list could not be read", () => {
    setEncoderInventoryForTests(null);
    expect(softwareEncoder("mp3")).toBe("libmp3lame");
  });
});

describe("softwareEncoderStatus", () => {
  it("lists nothing missing on the published image's inventory", () => {
    setEncoderInventoryForTests(QSV_ONLY);
    expect(softwareEncoderStatus()).toEqual({ missing: [], probeError: null });
  });

  it("lists every software encoder the build lacks, in target order", () => {
    setEncoderInventoryForTests(new Set(["libx264", "aac", "libopus"]));
    expect(softwareEncoderStatus().missing).toEqual([
      "libx265",
      "libsvtav1",
      "libvpx-vp9",
      "libmp3lame",
      "libvorbis",
      "libtheora",
      "libwebp_anim",
    ]);
  });

  it("lists all ten when the build has no software encoders at all", () => {
    setEncoderInventoryForTests(new Set(["h264_qsv"]));
    expect(softwareEncoderStatus().missing).toEqual([
      "libx264",
      "libx265",
      "libsvtav1",
      "libvpx-vp9",
      "aac",
      "libopus",
      "libmp3lame",
      "libvorbis",
      "libtheora",
      "libwebp_anim",
    ]);
  });

  /** The boot warning must name exactly the encoders that fail jobs. */
  it("agrees with resolveEncoder on which targets fail", () => {
    setEncoderInventoryForTests(new Set(["libx264", "libvpx-vp9", "aac", "h264_qsv"]));
    delete process.env.SNAPOTTER_HW_ACCEL;
    const { missing } = softwareEncoderStatus();
    for (const target of TARGETS) {
      let failedFor: string | null = null;
      try {
        resolveEncoder(target);
      } catch (err) {
        failedFor = /has no (\S+) encoder/.exec((err as Error).message)?.[1] ?? "unparsed";
      }
      if (failedFor) expect(missing).toContain(failedFor);
    }
    expect(missing).toEqual([
      "libx265",
      "libsvtav1",
      "libopus",
      "libmp3lame",
      "libvorbis",
      "libtheora",
      "libwebp_anim",
    ]);
  });

  it("reports the probe error instead of claiming everything is missing", () => {
    setEncoderInventoryForTests(null);
    const status = softwareEncoderStatus();
    expect(status.missing).toEqual([]);
    expect(status.probeError).toBeTruthy();
  });
});

describe("hwAccelStatus", () => {
  it("reports nothing requested when the variable is unset", () => {
    delete process.env.SNAPOTTER_HW_ACCEL;
    const status = hwAccelStatus();
    expect(status.requested).toBeNull();
    expect(status.recognized).toBe(false);
    expect(status.active).toEqual([]);
  });

  it("flags an unrecognised family", () => {
    process.env.SNAPOTTER_HW_ACCEL = "quantum";
    const status = hwAccelStatus();
    expect(status.requested).toBe("quantum");
    expect(status.recognized).toBe(false);
  });

  /**
   * FAMILIES is an object literal, so a bare index lookup returns truthy
   * inherited members and reports a typo as a real family whose encoders are
   * all missing. That sends the admin to debug their ffmpeg instead of their
   * config.
   */
  it.each(["constructor", "__proto__", "tostring", "valueof"])(
    "does not treat inherited Object member %s as a family",
    (value) => {
      setEncoderInventoryForTests(QSV_ONLY);
      process.env.SNAPOTTER_HW_ACCEL = value;
      const status = hwAccelStatus();
      expect(status.recognized).toBe(false);
      expect(resolveEncoder("h264")).toBe("libx264");
    },
  );

  it("lowercases the requested family the same way resolveEncoder does", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "NVENC";
    expect(hwAccelStatus().recognized).toBe(true);
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
  });

  /**
   * Asserted by exact contents, not by the union of the two arrays: a union
   * assertion holds even if active and missing are swapped, which would make
   * the boot log claim hardware encoding on the very image that lacks it.
   */
  it("splits a partial inventory into exactly active and missing", () => {
    setEncoderInventoryForTests(new Set([...QSV_ONLY, "h264_nvenc"]));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    const status = hwAccelStatus();
    expect(status.active).toEqual(["h264_nvenc"]);
    expect(status.missing).toEqual(["hevc_nvenc", "av1_nvenc"]);
    expect(status.probeError).toBeNull();
  });

  it("reports everything missing on the published image's inventory", () => {
    setEncoderInventoryForTests(QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    const status = hwAccelStatus();
    expect(status.active).toEqual([]);
    expect(status.missing).toEqual(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);
  });

  it("names the targets a family cannot accelerate at all", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    // VAAPI maps h264 and hevc only, so the rest silently stay on software.
    expect(hwAccelStatus().unmapped).toEqual([
      "av1",
      "vp9",
      "aac",
      "opus",
      "mp3",
      "vorbis",
      "theora",
      "webp",
    ]);
  });

  it("exposes the accepted family names for docs and logs", () => {
    expect(HW_ACCEL_FAMILIES).toEqual(["nvenc", "vaapi"]);
  });
});

/**
 * The probe is the only new I/O in the fix. CI has no ffmpeg, so these point
 * FFMPEG_PATH at stub scripts and re-import through a fresh module graph, the
 * way tests/integration/platform/media-engine-unavailable.test.ts does, since
 * media-engine caches the resolved binary in a module variable.
 */
describe("encoder probe against a stub ffmpeg", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapotter-encoder-probe-"));

  const TABLE = [
    "Encoders:",
    " V..... = Video",
    " ------",
    " V....D libx264              libx264 H.264 (codec h264)",
    " V....D libx265              libx265 H.265 / HEVC (codec hevc)",
    " V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)",
  ];

  /**
   * A stub ffmpeg. The table goes through a quoted heredoc so the flag columns
   * and backslashes reach stdout byte for byte.
   */
  function stub(
    name: string,
    opts: { lines?: string[]; toStderr?: boolean; exit?: number; countTo?: string } = {},
  ): string {
    const path = join(dir, name);
    const parts = ["#!/bin/sh"];
    if (opts.countTo) parts.push(`echo x >> ${opts.countTo}`);
    if (opts.lines) {
      parts.push(`cat <<'FFEOF'${opts.toStderr ? " >&2" : ""}`, ...opts.lines, "FFEOF");
    }
    if (opts.exit !== undefined) parts.push(`exit ${opts.exit}`);
    writeFileSync(path, `${parts.join("\n")}\n`);
    chmodSync(path, 0o755);
    return path;
  }

  async function freshEncoders(ffmpegPath: string) {
    vi.resetModules();
    process.env.FFMPEG_PATH = ffmpegPath;
    return await import("../../../packages/media-engine/src/encoders.js");
  }

  it("reads the inventory from stdout and uses a listed encoder", async () => {
    const mod = await freshEncoders(stub("ok.sh", { lines: TABLE }));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("h264_nvenc");
    expect(mod.hwAccelStatus().probeError).toBeNull();
  });

  it("ignores a table printed on stderr rather than stdout", async () => {
    const mod = await freshEncoders(stub("stderr.sh", { lines: TABLE, toStderr: true }));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    expect(mod.hwAccelStatus().probeError).toMatch(/no recognisable encoder rows/);
  });

  it("falls back and explains when the binary exits non-zero", async () => {
    const mod = await freshEncoders(stub("fail.sh", { exit: 3 }));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    expect(mod.hwAccelStatus().probeError).toMatch(/exited code 3/);
  });

  it("falls back and explains when the binary does not exist", async () => {
    const mod = await freshEncoders(join(dir, "definitely-not-here"));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    expect(mod.hwAccelStatus().probeError).toBeTruthy();
  });

  /**
   * resolveEncoder is called up to four times while building one ffmpeg
   * command line, and the probe is a blocking spawn. Without the cache every
   * call would fork a process on the worker's event loop.
   */
  it("probes at most once per process", async () => {
    const counter = join(dir, "calls.log");
    const mod = await freshEncoders(stub("count.sh", { lines: TABLE, countTo: counter }));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    mod.resolveEncoder("h264");
    mod.resolveEncoder("hevc");
    mod.resolveEncoder("h264");
    mod.hwAccelStatus();
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(1);
  });

  /**
   * The software path probes too since #1092, so it gets the same once-only
   * guarantee the hardware path has.
   */
  it("probes at most once when no accel is configured", async () => {
    const counter = join(dir, "calls-unset.log");
    const mod = await freshEncoders(stub("count-unset.sh", { lines: TABLE, countTo: counter }));
    delete process.env.SNAPOTTER_HW_ACCEL;
    mod.resolveEncoder("h264");
    mod.resolveEncoder("h264");
    mod.softwareEncoderStatus();
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("refuses a software encoder the stub build does not list (#1092)", async () => {
    // TABLE lists libx264 but not libvpx-vp9.
    const mod = await freshEncoders(stub("lean.sh", { lines: TABLE }));
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    expect(() => mod.resolveEncoder("vp9")).toThrow(/libvpx-vp9/);
  });

  it("still returns software when the binary does not exist (#1092)", async () => {
    const mod = await freshEncoders(join(dir, "missing-for-software"));
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(mod.resolveEncoder("vp9")).toBe("libvpx-vp9");
  });
});

describe("parseEncoderNames", () => {
  it("rejects the legend rows above the table", () => {
    const names = parseEncoderNames(
      [
        "Encoders:",
        " V..... = Video",
        " A..... = Audio",
        " ------",
        " V....D libx264              libx264 H.264 (codec h264)",
      ].join("\n"),
    );
    expect(names.has("libx264")).toBe(true);
    expect(names.has("=")).toBe(false);
    expect(names.has("Video")).toBe(false);
  });
});
