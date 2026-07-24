import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutation-focused coverage for apps/api/src/lib/exiftool.ts, the metadata
// read/write/strip boundary. The strategy that kills mutants here has two
// halves. For the argv builders (inspectMetadata, writeMetadata,
// readImageDimensions, findExiftool) we mock the process boundary and assert
// the EXACT argument array ExifTool is spawned with, so a dropped, reordered,
// or renamed flag dies. For the output parser inside inspectMetadata we feed
// canned ExifTool -json output and assert the exact grouped structure, so a
// mutant that flips a group comparison, a `startsWith`, an array branch, or an
// `Object.keys().length > 0 ? x : null` gate is caught. Only the child_process
// / util / fs boundary is mocked; all parsing and argv logic runs for real.

const { mockExecFile, mockWriteFile, mockReadFile, mockRm } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockReadFile: vi.fn().mockResolvedValue(Buffer.from("readback-bytes")),
  mockRm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:util", () => ({ promisify: () => mockExecFile }));
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  rm: mockRm,
}));

import {
  buildTagArgs,
  inspectMetadata,
  readImageDimensions,
  writeMetadata,
} from "../../../apps/api/src/lib/exiftool.js";

type ExiftoolModule = typeof import("../../../apps/api/src/lib/exiftool.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Result shape that `promisify(execFile)` resolves to. */
type ExecResult = { stdout: string; stderr: string };

/**
 * Install an execFile mock that answers the `-ver` probe with a version string
 * and routes every other invocation to `respond`. `respond` receives the bin
 * and args and returns the resolved `{stdout,stderr}` (or throws to simulate a
 * non-zero exit). The `-ver` arm keeps `findExiftool` happy without each test
 * having to special-case it.
 */
function withExiftool(
  respond: (bin: string, args: string[]) => ExecResult | Promise<ExecResult>,
): void {
  mockExecFile.mockImplementation(async (bin: string, args: string[]): Promise<ExecResult> => {
    if (args[0] === "-ver") return { stdout: "12.76\n", stderr: "" };
    return respond(bin, args);
  });
}

/** The args of the first non-`-ver` execFile call. */
function operationArgs(): string[] {
  const call = mockExecFile.mock.calls.find((c) => c[1][0] !== "-ver");
  if (!call) throw new Error("no operation execFile call was made");
  return call[1] as string[];
}

/** The options object of the first non-`-ver` execFile call. */
function operationOpts(): Record<string, unknown> {
  const call = mockExecFile.mock.calls.find((c) => c[1][0] !== "-ver");
  if (!call) throw new Error("no operation execFile call was made");
  return call[2] as Record<string, unknown>;
}

/** Wrap a single record the way ExifTool -json emits it (an array of objects). */
function exifJson(record: Record<string, unknown>): ExecResult {
  return { stdout: JSON.stringify([{ SourceFile: "/x.jpg", ...record }]), stderr: "" };
}

beforeEach(() => {
  mockExecFile.mockReset();
  mockWriteFile.mockClear();
  mockReadFile.mockClear();
  mockRm.mockClear();
});

// ===========================================================================
// findExiftool (private): version probe argv + failure message + cache.
//
// findExiftool is not exported, so it is driven through the public functions
// that call it. The module-level `cachedBinary` survives once any test in the
// shared instance resolves it, which would hide the probe. To observe the FIRST
// probe and the not-found throw deterministically, each of these tests loads a
// FRESH module instance with its own mocks via resetModules + doMock.
// ===========================================================================

/**
 * Load a fresh, uncached copy of exiftool.ts wired to `exec` for both execFile
 * and promisify. Isolating the module resets `cachedBinary`, so the `-ver`
 * probe runs on the next call.
 */
async function loadFreshExiftool(exec: ReturnType<typeof vi.fn>): Promise<ExiftoolModule> {
  vi.resetModules();
  vi.doMock("node:child_process", () => ({ execFile: exec }));
  vi.doMock("node:util", () => ({ promisify: () => exec }));
  vi.doMock("node:fs/promises", () => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("readback-bytes")),
    rm: vi.fn().mockResolvedValue(undefined),
  }));
  return import("../../../apps/api/src/lib/exiftool.js");
}

describe("findExiftool (via public API, fresh module)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('probes the binary with exactly ["-ver"] and a 5s timeout on first use', async () => {
    const exec = vi.fn(async (_bin: string, args: string[]) => {
      if (args[0] === "-ver") return { stdout: "12.76\n", stderr: "" };
      return exifJson({ "EXIF:Make": "Canon" });
    });
    const mod = await loadFreshExiftool(exec);
    await mod.inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(exec).toHaveBeenCalledWith("exiftool", ["-ver"], { timeout: 5_000 });
  });

  it("caches the resolved binary so a second operation issues no new -ver probe", async () => {
    const exec = vi.fn(async (_bin: string, args: string[]) => {
      if (args[0] === "-ver") return { stdout: "12.76\n", stderr: "" };
      return exifJson({ "EXIF:Make": "Canon" });
    });
    const mod = await loadFreshExiftool(exec);
    await mod.inspectMetadata(Buffer.from("img"), "a.jpg");
    await mod.inspectMetadata(Buffer.from("img"), "b.jpg");
    const verCalls = exec.mock.calls.filter((c) => (c[1] as string[])[0] === "-ver");
    // Cached after the first resolve: exactly one probe across both operations.
    expect(verCalls).toHaveLength(1);
  });

  it("surfaces the install-hint message from inspectMetadata when the probe fails", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("spawn exiftool ENOENT"));
    const mod = await loadFreshExiftool(exec);
    await expect(mod.inspectMetadata(Buffer.from("img"), "photo.jpg")).rejects.toThrow(
      "ExifTool not found. Install libimage-exiftool-perl (Linux) or brew install exiftool (macOS).",
    );
  });

  it("readImageDimensions swallows a missing binary and returns null", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("spawn exiftool ENOENT"));
    const mod = await loadFreshExiftool(exec);
    await expect(mod.readImageDimensions(Buffer.from("img"), "jpg")).resolves.toBeNull();
  });
});

// ===========================================================================
// inspectMetadata: argv, options, temp-file handling
// ===========================================================================

describe("inspectMetadata argv and options", () => {
  it("spawns exiftool with the exact [-json -G -struct -n <tempPath>] argv", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    await inspectMetadata(Buffer.from("img"), "photo.jpg");
    const args = operationArgs();
    expect(args.slice(0, 4)).toEqual(["-json", "-G", "-struct", "-n"]);
    expect(args).toHaveLength(5);
    expect(args[4]).toContain("exif-inspect-");
    expect(args[4].endsWith(".jpg")).toBe(true);
  });

  it("uses a 60s timeout and a 10MiB maxBuffer", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    await inspectMetadata(Buffer.from("img"), "photo.jpg");
    const opts = operationOpts();
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(10 * 1024 * 1024);
  });

  it("preserves the filename extension in the temp path", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    await inspectMetadata(Buffer.from("img"), "scan.tiff");
    expect(operationArgs()[4].endsWith(".tiff")).toBe(true);
  });

  it("falls back to .jpg when the filename has no extension", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    await inspectMetadata(Buffer.from("img"), "no-extension");
    expect(operationArgs()[4].endsWith(".jpg")).toBe(true);
  });

  it("writes the buffer to disk and removes the temp file afterward", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    const buf = Buffer.from("the-image-bytes");
    await inspectMetadata(buf, "photo.jpg");
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockWriteFile.mock.calls[0][1]).toBe(buf);
    expect(mockRm).toHaveBeenCalledTimes(1);
    expect(mockRm.mock.calls[0][1]).toEqual({ force: true });
  });
});

describe("inspectMetadata parsing and grouping", () => {
  it("reports the passed filename and the buffer's byte length", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    const buf = Buffer.from("abcdef"); // 6 bytes
    const result = await inspectMetadata(buf, "given-name.jpg");
    expect(result.filename).toBe("given-name.jpg");
    expect(result.fileSize).toBe(6);
  });

  it("skips the SourceFile key and never leaks it into a section", async () => {
    withExiftool(() => exifJson({ "EXIF:Make": "Canon" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.exif).toEqual({ Make: "Canon" });
    // SourceFile has no colon, so a mutant that stops skipping it would route
    // it into the File-group bucket (dropped) but must never appear anywhere.
    expect(JSON.stringify(result)).not.toContain("SourceFile");
  });

  it("routes an EXIF-group tag into exif under its bare field name", async () => {
    withExiftool(() => exifJson({ "EXIF:Artist": "Ansel", "EXIF:Software": "SnapOtter" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.exif).toEqual({ Artist: "Ansel", Software: "SnapOtter" });
    expect(result.iptc).toBeNull();
    expect(result.xmp).toBeNull();
    expect(result.gps).toBeNull();
  });

  it("collects IPTC:Keywords given as an array into keywords and iptc", async () => {
    withExiftool(() => exifJson({ "IPTC:Keywords": ["sky", "sea"] }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual(["sky", "sea"]);
    expect(result.iptc).toEqual({ Keywords: ["sky", "sea"] });
  });

  it("collects a scalar IPTC:Keywords value as a single keyword", async () => {
    withExiftool(() => exifJson({ "IPTC:Keywords": "solo" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual(["solo"]);
    expect(result.iptc).toEqual({ Keywords: "solo" });
  });

  it("coerces non-string IPTC:Keywords array members via String()", async () => {
    withExiftool(() => exifJson({ "IPTC:Keywords": [1, 2] }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual(["1", "2"]);
  });

  it("keeps a non-Keywords IPTC field in iptc but out of keywords", async () => {
    withExiftool(() => exifJson({ "IPTC:City": "Kyoto" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.iptc).toEqual({ City: "Kyoto" });
    expect(result.keywords).toEqual([]);
  });

  it("does not push an empty/falsy scalar IPTC:Keywords value", async () => {
    withExiftool(() => exifJson({ "IPTC:Keywords": "" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual([]);
    // The field itself is still recorded on iptc even when empty.
    expect(result.iptc).toEqual({ Keywords: "" });
  });

  it("harvests XMP:Subject array entries into keywords and stores them in xmp", async () => {
    withExiftool(() => exifJson({ "XMP:Subject": ["macro", "insect"] }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual(["macro", "insect"]);
    expect(result.xmp).toEqual({ Subject: ["macro", "insect"] });
  });

  it("does not treat a scalar XMP:Subject as keywords", async () => {
    withExiftool(() => exifJson({ "XMP:Subject": "notarray" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual([]);
    expect(result.xmp).toEqual({ Subject: "notarray" });
  });

  it("keeps a non-Subject XMP field in xmp", async () => {
    withExiftool(() => exifJson({ "XMP:Creator": "Jane" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.xmp).toEqual({ Creator: "Jane" });
    expect(result.keywords).toEqual([]);
  });

  it("deduplicates keywords sourced from both IPTC and XMP", async () => {
    withExiftool(() =>
      exifJson({ "IPTC:Keywords": ["dup", "iptc-only"], "XMP:Subject": ["dup", "xmp-only"] }),
    );
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.keywords).toEqual(["dup", "iptc-only", "xmp-only"]);
  });

  it("puts a GPS-group GPS* field into gps", async () => {
    withExiftool(() => exifJson({ "GPS:GPSLatitude": "40 deg", "GPS:GPSLongitude": "74 deg" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.gps).toEqual({ GPSLatitude: "40 deg", GPSLongitude: "74 deg" });
  });

  it("accepts a Composite:GPSPosition field into gps", async () => {
    withExiftool(() => exifJson({ "Composite:GPSPosition": "40 deg N, 74 deg W" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.gps).toEqual({ GPSPosition: "40 deg N, 74 deg W" });
  });

  it("excludes a Composite field that is neither GPS-prefixed nor GPSPosition", async () => {
    withExiftool(() => exifJson({ "Composite:ImageSize": "800x600" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    // ImageSize does not start with GPS and is not GPSPosition, so gps stays null.
    expect(result.gps).toBeNull();
  });

  it("routes a colon-less top-level key into the File group (dropped from all sections)", async () => {
    withExiftool(() => exifJson({ FileType: "JPEG", "EXIF:Make": "Canon" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    // File-group fields are not surfaced in any of the four buckets.
    expect(result.exif).toEqual({ Make: "Canon" });
    expect(result.iptc).toBeNull();
    expect(result.xmp).toBeNull();
    expect(result.gps).toBeNull();
    expect(JSON.stringify(result)).not.toContain("JPEG");
  });

  it("returns null for every section and empty keywords when only File-group data exists", async () => {
    withExiftool(() => exifJson({ FileType: "PNG", FileSize: "12 kB" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.png");
    expect(result.exif).toBeNull();
    expect(result.iptc).toBeNull();
    expect(result.xmp).toBeNull();
    expect(result.gps).toBeNull();
    expect(result.keywords).toEqual([]);
  });

  it("handles an empty ExifTool result array (parsed[0] undefined -> {})", async () => {
    withExiftool(() => ({ stdout: "[]", stderr: "" }));
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.exif).toBeNull();
    expect(result.iptc).toBeNull();
    expect(result.xmp).toBeNull();
    expect(result.gps).toBeNull();
    expect(result.keywords).toEqual([]);
    expect(result.filename).toBe("photo.jpg");
  });

  it("populates every section at once when mixed-group data is present", async () => {
    withExiftool(() =>
      exifJson({
        "EXIF:Make": "Canon",
        "IPTC:City": "Kyoto",
        "XMP:Creator": "Jane",
        "GPS:GPSLatitude": "40 deg",
      }),
    );
    const result = await inspectMetadata(Buffer.from("img"), "photo.jpg");
    expect(result.exif).toEqual({ Make: "Canon" });
    expect(result.iptc).toEqual({ City: "Kyoto" });
    expect(result.xmp).toEqual({ Creator: "Jane" });
    expect(result.gps).toEqual({ GPSLatitude: "40 deg" });
  });
});

describe("inspectMetadata error handling", () => {
  it("throws a path-scrubbed error when exiftool exits non-zero", async () => {
    withExiftool(() => {
      throw new Error("exiftool failed on /tmp/exif-inspect-abc.jpg: bad file");
    });
    await expect(inspectMetadata(Buffer.from("img"), "photo.jpg")).rejects.toThrow(/\[internal\]/);
    // The raw tmp path must not survive into the surfaced message.
    await expect(inspectMetadata(Buffer.from("img"), "photo.jpg")).rejects.not.toThrow(
      /exif-inspect-abc\.jpg/,
    );
  });

  it("throws when stdout is not valid JSON", async () => {
    withExiftool(() => ({ stdout: "not-json{", stderr: "" }));
    await expect(inspectMetadata(Buffer.from("img"), "photo.jpg")).rejects.toBeInstanceOf(Error);
  });

  it("still removes the temp file when parsing throws", async () => {
    withExiftool(() => ({ stdout: "not-json{", stderr: "" }));
    await inspectMetadata(Buffer.from("img"), "photo.jpg").catch(() => {});
    expect(mockRm).toHaveBeenCalledTimes(1);
    expect(mockRm.mock.calls[0][1]).toEqual({ force: true });
  });
});

// ===========================================================================
// writeMetadata: argv, readback, empty-tags shortcut, error handling
// ===========================================================================

describe("writeMetadata", () => {
  it("returns the original buffer untouched and spawns nothing for empty tags", async () => {
    const buf = Buffer.from("unchanged");
    const out = await writeMetadata(buf, "photo.jpg", []);
    expect(out).toBe(buf);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("spawns exiftool with -overwrite_original, then the tags, then the temp path", async () => {
    withExiftool(() => ({ stdout: "", stderr: "" }));
    await writeMetadata(Buffer.from("img"), "photo.jpg", ["-Artist=Bob", "-Copyright=2024"]);
    const args = operationArgs();
    expect(args[0]).toBe("-overwrite_original");
    expect(args[1]).toBe("-Artist=Bob");
    expect(args[2]).toBe("-Copyright=2024");
    expect(args[3]).toContain("exif-write-");
    expect(args).toHaveLength(4);
  });

  it("uses a 60s timeout and 10MiB maxBuffer for the write", async () => {
    withExiftool(() => ({ stdout: "", stderr: "" }));
    await writeMetadata(Buffer.from("img"), "photo.jpg", ["-Artist=Bob"]);
    const opts = operationOpts();
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(10 * 1024 * 1024);
  });

  it("returns the bytes read back from the temp file after writing", async () => {
    withExiftool(() => ({ stdout: "", stderr: "" }));
    mockReadFile.mockResolvedValueOnce(Buffer.from("post-write-image"));
    const out = await writeMetadata(Buffer.from("img"), "photo.jpg", ["-Artist=Bob"]);
    expect(out.toString()).toBe("post-write-image");
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("preserves the filename extension in the temp path", async () => {
    withExiftool(() => ({ stdout: "", stderr: "" }));
    await writeMetadata(Buffer.from("img"), "scan.png", ["-Artist=Bob"]);
    expect(operationArgs()[operationArgs().length - 1].endsWith(".png")).toBe(true);
  });

  it("falls back to .jpg when the filename has no extension", async () => {
    withExiftool(() => ({ stdout: "", stderr: "" }));
    await writeMetadata(Buffer.from("img"), "noext", ["-Artist=Bob"]);
    const last = operationArgs()[operationArgs().length - 1];
    expect(last.endsWith(".jpg")).toBe(true);
  });

  it("throws a path-scrubbed error when exiftool fails, and cleans up the temp file", async () => {
    withExiftool(() => {
      throw new Error("write failed at /tmp/exif-write-xyz.png");
    });
    await expect(writeMetadata(Buffer.from("img"), "photo.png", ["-Artist=Bob"])).rejects.toThrow(
      /\[internal\]/,
    );
    expect(mockRm).toHaveBeenCalled();
    expect(mockRm.mock.calls[0][1]).toEqual({ force: true });
  });
});

// ===========================================================================
// readImageDimensions: argv, suffix logic, null gates
// ===========================================================================

describe("readImageDimensions", () => {
  it("spawns exiftool with exactly [-json -ImageWidth -ImageHeight <tempPath>] and a 10s timeout", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 800, ImageHeight: 600 }]),
      stderr: "",
    }));
    await readImageDimensions(Buffer.from("img"), "jpg");
    const args = operationArgs();
    expect(args.slice(0, 3)).toEqual(["-json", "-ImageWidth", "-ImageHeight"]);
    expect(args).toHaveLength(4);
    expect(operationOpts().timeout).toBe(10_000);
  });

  it("returns the parsed width and height", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 1920, ImageHeight: 1080 }]),
      stderr: "",
    }));
    const dims = await readImageDimensions(Buffer.from("img"), "png");
    expect(dims).toEqual({ width: 1920, height: 1080 });
  });

  it("builds a dotted suffix from a bare extension", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 10, ImageHeight: 10 }]),
      stderr: "",
    }));
    await readImageDimensions(Buffer.from("img"), "webp");
    expect(operationArgs()[3].endsWith(".webp")).toBe(true);
  });

  it("does not double the dot when the extension already starts with one", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 10, ImageHeight: 10 }]),
      stderr: "",
    }));
    await readImageDimensions(Buffer.from("img"), ".tiff");
    const last = operationArgs()[3];
    expect(last.endsWith(".tiff")).toBe(true);
    expect(last.endsWith("..tiff")).toBe(false);
  });

  it("falls back to a .jpg suffix when no extension is given", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 10, ImageHeight: 10 }]),
      stderr: "",
    }));
    await readImageDimensions(Buffer.from("img"));
    expect(operationArgs()[3].endsWith(".jpg")).toBe(true);
  });

  it("returns null when ImageWidth is missing", async () => {
    withExiftool(() => ({ stdout: JSON.stringify([{ ImageHeight: 600 }]), stderr: "" }));
    const dims = await readImageDimensions(Buffer.from("img"), "jpg");
    expect(dims).toBeNull();
  });

  it("returns null when ImageHeight is missing", async () => {
    withExiftool(() => ({ stdout: JSON.stringify([{ ImageWidth: 800 }]), stderr: "" }));
    const dims = await readImageDimensions(Buffer.from("img"), "jpg");
    expect(dims).toBeNull();
  });

  it("returns null when a dimension is zero (falsy guard)", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 0, ImageHeight: 480 }]),
      stderr: "",
    }));
    const dims = await readImageDimensions(Buffer.from("img"), "jpg");
    expect(dims).toBeNull();
  });

  it("returns null when the record itself is absent (empty result array)", async () => {
    withExiftool(() => ({ stdout: "[]", stderr: "" }));
    const dims = await readImageDimensions(Buffer.from("img"), "jpg");
    expect(dims).toBeNull();
  });

  it("returns null (never throws) when exiftool exits non-zero", async () => {
    withExiftool(() => {
      throw new Error("boom");
    });
    await expect(readImageDimensions(Buffer.from("img"), "jpg")).resolves.toBeNull();
  });

  it("removes the temp file after a successful read", async () => {
    withExiftool(() => ({
      stdout: JSON.stringify([{ ImageWidth: 10, ImageHeight: 10 }]),
      stderr: "",
    }));
    await readImageDimensions(Buffer.from("img"), "jpg");
    expect(mockRm).toHaveBeenCalledTimes(1);
    expect(mockRm.mock.calls[0][1]).toEqual({ force: true });
  });
});

// ===========================================================================
// buildTagArgs: exact-order argv assertions that -toContain tests miss
// ===========================================================================

describe("buildTagArgs exact ordering (kills reorder/drop mutants)", () => {
  it("emits the four GPS tags in latitude, lat-ref, longitude, lon-ref order", () => {
    const args = buildTagArgs({ gpsLatitude: -33.8688, gpsLongitude: 151.2093 });
    expect(args).toEqual([
      "-GPSLatitude=33.8688",
      "-GPSLatitudeRef=S",
      "-GPSLongitude=151.2093",
      "-GPSLongitudeRef=E",
    ]);
  });

  it("appends altitude and its ref immediately after the four base GPS tags", () => {
    const args = buildTagArgs({ gpsLatitude: 10, gpsLongitude: 20, gpsAltitude: -50 });
    expect(args).toEqual([
      "-GPSLatitude=10",
      "-GPSLatitudeRef=N",
      "-GPSLongitude=20",
      "-GPSLongitudeRef=E",
      "-GPSAltitude=50",
      "-GPSAltitudeRef=Below Sea Level",
    ]);
  });

  it("builds the AllDates shift string as '<dir>=0:0:0 <value>:0'", () => {
    expect(buildTagArgs({ dateShift: "-3" })).toEqual(["-AllDates-=0:0:0 3:0"]);
    expect(buildTagArgs({ dateShift: "+7" })).toEqual(["-AllDates+=0:0:0 7:0"]);
    expect(buildTagArgs({ dateShift: "2" })).toEqual(["-AllDates+=0:0:0 2:0"]);
  });

  it("in set mode clears both keyword tags before the additive writes, in order", () => {
    const args = buildTagArgs({ keywords: ["a", "b"], keywordsMode: "set" });
    expect(args).toEqual([
      "-IPTC:Keywords=",
      "-XMP:Subject=",
      "-IPTC:Keywords+=a",
      "-XMP:Subject+=a",
      "-IPTC:Keywords+=b",
      "-XMP:Subject+=b",
    ]);
  });

  it("in add mode emits only additive keyword writes and no clears", () => {
    const args = buildTagArgs({ keywords: ["x"], keywordsMode: "add" });
    expect(args).toEqual(["-IPTC:Keywords+=x", "-XMP:Subject+=x"]);
  });

  it("throws before emitting any removal arg when a later field name is unsafe", () => {
    expect(() => buildTagArgs({ fieldsToRemove: ["Artist", "bad;rm"] })).toThrow(
      /Invalid tag name "bad;rm"/,
    );
  });

  it("emits -<field>= for each safe removal in order", () => {
    expect(buildTagArgs({ fieldsToRemove: ["Artist", "GPS:GPSLatitude"] })).toEqual([
      "-Artist=",
      "-GPS:GPSLatitude=",
    ]);
  });
});
