import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HW_ACCEL_FAMILIES,
  hwAccelStatus,
  parseEncoderNames,
  resolveEncoder,
  setEncoderInventoryForTests,
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
  "h264_qsv",
  "hevc_qsv",
]);

const WITH_NVENC = new Set([...QSV_ONLY, "h264_nvenc", "hevc_nvenc", "av1_nvenc"]);

describe("resolveEncoder", () => {
  it("defaults to software encoders", () => {
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
    expect(resolveEncoder("aac")).toBe("aac");
  });

  it("falls back to software for unknown accel values", () => {
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
    expect(hwAccelStatus().unmapped).toEqual(["av1", "vp9", "aac", "opus", "mp3"]);
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

  it("does not spawn at all when no accel is configured", async () => {
    const counter = join(dir, "calls-unset.log");
    const mod = await freshEncoders(stub("count-unset.sh", { lines: TABLE, countTo: counter }));
    delete process.env.SNAPOTTER_HW_ACCEL;
    mod.resolveEncoder("h264");
    mod.resolveEncoder("vp9");
    expect(() => readFileSync(counter, "utf8")).toThrow();
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
