import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { logHwAccel } from "../../../apps/api/src/jobs/worker.js";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import { friendlyError } from "../../../apps/api/src/lib/errors.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
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

  it("falls back to software when the build lists the hardware encoder and the trial encode fails (#1089)", () => {
    setEncoderInventoryForTests(WITH_NVENC, QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
  });

  it("uses only the hardware encoders whose trial encode succeeds on a mixed-capability GPU (#1089)", () => {
    setEncoderInventoryForTests(WITH_NVENC, new Set([...QSV_ONLY, "h264_nvenc", "hevc_nvenc"]));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
    expect(resolveEncoder("hevc")).toBe("hevc_nvenc");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
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

  it("throws when a listed hardware encoder fails the trial encode and the software fallback is missing (#1089)", () => {
    setEncoderInventoryForTests(new Set([...NO_LIBX264, "h264_nvenc"]), NO_LIBX264);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(() => resolveEncoder("h264")).toThrow(/libx264/);
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
    expect(status.unusable).toEqual([]);
  });

  it("moves listed encoders that fail the trial encode from active to unusable (#1089)", () => {
    setEncoderInventoryForTests(WITH_NVENC, QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    const status = hwAccelStatus();
    expect(status.active).toEqual([]);
    expect(status.missing).toEqual([]);
    expect(status.unusable).toEqual(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);
  });

  it("separates active, unusable and missing across a partial inventory (#1089)", () => {
    setEncoderInventoryForTests(
      new Set([...QSV_ONLY, "h264_nvenc", "hevc_nvenc"]),
      new Set([...QSV_ONLY, "h264_nvenc"]),
    );
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    const status = hwAccelStatus();
    expect(status.active).toEqual(["h264_nvenc"]);
    expect(status.unusable).toEqual(["hevc_nvenc"]);
    expect(status.missing).toEqual(["av1_nvenc"]);
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
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

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
   * call would fork a process on the worker's event loop. With a family set,
   * the inventory probe and each listed hardware encoder's trial encode run at
   * most once per process (#1089).
   */
  it("probes the inventory and each listed hardware encoder at most once per process", async () => {
    const counter = join(dir, "calls.log");
    const mod = await freshEncoders(stub("count.sh", { lines: TABLE, countTo: counter }));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    mod.resolveEncoder("h264");
    mod.resolveEncoder("hevc");
    mod.resolveEncoder("h264");
    mod.hwAccelStatus();
    // 1 spawn for `ffmpeg -encoders` + 1 trial encode for the single listed
    // hardware encoder (`h264_nvenc`); `hevc_nvenc` and `av1_nvenc` are not in
    // TABLE so they are never trial-encoded.
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("falls back to software when the stub lists h264_nvenc and the trial encode fails (#1089)", async () => {
    const counter = join(dir, "calls-no-gpu.log");
    const bin = join(dir, "nvenc-no-gpu.sh");
    const noGpuLines = [
      "#!/bin/sh",
      `echo x >> ${counter}`,
      'case "$*" in',
      "  *-encoders*)",
      "    cat <<'FFEOF'",
      ...TABLE,
      "FFEOF",
      "    exit 0",
      "    ;;",
      "  *)",
      '    echo "[h264_nvenc @ 0x1] Cannot load libnvidia-encode.so.1" >&2',
      "    exit 1",
      "    ;;",
      "esac",
    ];
    writeFileSync(bin, `${noGpuLines.join("\n")}\n`);
    chmodSync(bin, 0o755);

    const mod = await freshEncoders(bin);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    expect(mod.resolveEncoder("h264")).toBe("libx264");
    const status = mod.hwAccelStatus();
    expect(status.active).toEqual([]);
    expect(status.unusable).toEqual(["h264_nvenc"]);
    expect(status.missing).toEqual(["hevc_nvenc", "av1_nvenc"]);
    expect(status.probeError).toBeNull();
    // Failed trial encodes must be cached too (1 -encoders probe + 1 failed trial).
    expect(readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("trial-encodes at 256x256 so Turing+ NVENC minimum width (145px) does not reject the probe (#1089)", async () => {
    const bin = join(dir, "nvenc-min-dim.sh");
    const minDimLines = [
      "#!/bin/sh",
      'case "$*" in',
      "  *-encoders*)",
      "    cat <<'FFEOF'",
      ...TABLE,
      "FFEOF",
      "    exit 0",
      "    ;;",
      "  *nullsrc=s=256x256*)",
      "    exit 0",
      "    ;;",
      "  *)",
      '    echo "[h264_nvenc @ 0x1] Frame Dimension less than the minimum supported value" >&2',
      "    exit 1",
      "    ;;",
      "esac",
    ];
    writeFileSync(bin, `${minDimLines.join("\n")}\n`);
    chmodSync(bin, 0o755);

    const mod = await freshEncoders(bin);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(mod.resolveEncoder("h264")).toBe("h264_nvenc");
    expect(mod.hwAccelStatus().active).toEqual(["h264_nvenc"]);
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

describe("logHwAccel (#1089)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs nothing when SNAPOTTER_HW_ACCEL is unset", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    delete process.env.SNAPOTTER_HW_ACCEL;

    logHwAccel();

    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("warns on an unrecognised encoder family", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    process.env.SNAPOTTER_HW_ACCEL = "quantum";

    logHwAccel();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toBe(
      'SNAPOTTER_HW_ACCEL="quantum" is not a recognised encoder family (nvenc, vaapi); using software encoders',
    );
  });

  it("warns that the build lists none of them when none are in the inventory", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    setEncoderInventoryForTests(QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";

    logHwAccel();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toBe(
      'SNAPOTTER_HW_ACCEL="nvenc" was requested but this ffmpeg build lists none of them; using software encoders',
    );
  });

  it("warns with the probe error when the encoder list could not be read", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    setEncoderInventoryForTests(null);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";

    logHwAccel();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toBe(
      'SNAPOTTER_HW_ACCEL="nvenc" was requested but pinned by test; using software encoders',
    );
  });

  it("warns when the build lists the encoders and their trial encode fails", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    setEncoderInventoryForTests(WITH_NVENC, QSV_ONLY);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";

    logHwAccel();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({
      requested: "nvenc",
      missing: [],
      unusable: ["h264_nvenc", "hevc_nvenc", "av1_nvenc"],
      probeError: null,
    });
    expect(warn.mock.calls[0]?.[1]).toBe(
      'SNAPOTTER_HW_ACCEL="nvenc" was requested but trial encode failed for h264_nvenc, hevc_nvenc, av1_nvenc; using software encoders',
    );
  });

  it("warns when some encoders pass the trial encode and others are missing or unusable", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    setEncoderInventoryForTests(
      new Set([...QSV_ONLY, "h264_nvenc", "hevc_nvenc"]),
      new Set([...QSV_ONLY, "h264_nvenc"]),
    );
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";

    logHwAccel();

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({
      requested: "nvenc",
      active: ["h264_nvenc"],
      missing: ["av1_nvenc"],
      unusable: ["hevc_nvenc"],
    });
    expect(warn.mock.calls[0]?.[1]).toBe(
      'SNAPOTTER_HW_ACCEL="nvenc" is partly available; av1_nvenc, hevc_nvenc fall back to software; vp9, aac, opus, mp3, vorbis, theora, webp always use software',
    );
  });

  it("logs 'Hardware encoders enabled' when every encoder in the family passes the trial encode", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";

    logHwAccel();

    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toEqual({
      requested: "nvenc",
      active: ["h264_nvenc", "hevc_nvenc", "av1_nvenc"],
      unmapped: ["vp9", "aac", "opus", "mp3", "vorbis", "theora", "webp"],
    });
    expect(info.mock.calls[0]?.[1]).toBe(
      "Hardware encoders enabled: h264_nvenc, hevc_nvenc, av1_nvenc; vp9, aac, opus, mp3, vorbis, theora, webp always use software",
    );
  });
});
