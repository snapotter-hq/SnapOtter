import {
  connectivityClass,
  extractErrorCode,
  isClientAbort,
  isEnvironmentalDbError,
  rebuildErrorValue,
  SafeError,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const sysErr = (code: string, syscall?: string) =>
  Object.assign(new Error(`${code}: boom /Users/secret/file.png`), { code, syscall });

describe("rebuildErrorValue", () => {
  it("passes SafeError messages through", () => {
    expect(rebuildErrorValue(new SafeError("Storage directory is not writable"))).toBe(
      "Storage directory is not writable",
    );
  });
  it("rebuilds node system errors as code + syscall, no path", () => {
    expect(rebuildErrorValue(sysErr("EACCES", "mkdir"))).toBe("EACCES mkdir");
    expect(rebuildErrorValue(sysErr("ENOSPC"))).toBe("ENOSPC");
  });
  it("keeps only the verb of a spawn syscall, never the binary path (#1588)", () => {
    expect(rebuildErrorValue(sysErr("EACCES", "spawn /opt/bin/notexec.sh"))).toBe("EACCES spawn");
    expect(rebuildErrorValue(sysErr("ENOENT", "spawn ffmpeg"))).toBe("ENOENT spawn");
  });
  it("drops a path-shaped syscall entirely rather than echoing it", () => {
    expect(rebuildErrorValue(sysErr("EACCES", "/opt/bin/notexec.sh"))).toBe("EACCES");
  });
  it("resolves a 5-char EPIPE as a node code, not a SQLSTATE", () => {
    expect(rebuildErrorValue(sysErr("EPIPE", "write"))).toBe("EPIPE write");
  });
  it("finds a pg SQLSTATE through a drizzle-style cause chain, never the SQL", () => {
    const pg = Object.assign(new Error('relation "settings" does not exist'), {
      code: "42P01",
      severity: "ERROR",
    });
    const wrapped = Object.assign(new Error('Failed query: select "value" from "settings"'), {
      cause: pg,
    });
    expect(rebuildErrorValue(wrapped)).toBe("pg 42P01");
  });
  it("appends a vetted pg routine when present", () => {
    const pg = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
      routine: "ProcessInterrupts",
    });
    expect(rebuildErrorValue(pg)).toBe("pg 57P01 ProcessInterrupts");
  });
  it("keeps only the first token of a redis ReplyError", () => {
    const err = Object.assign(new Error("NOAUTH Authentication required secret-arg"), {
      name: "ReplyError",
    });
    expect(rebuildErrorValue(err)).toBe("reply NOAUTH");
  });
  it("returns bare reply when the ReplyError first token is not code-shaped", () => {
    const err = Object.assign(new Error("user_script:1:attempted-to-index-secret"), {
      name: "ReplyError",
    });
    expect(rebuildErrorValue(err)).toBe("reply");
  });
  it("rebuilds zod errors as issue code + path", () => {
    const err = Object.assign(new Error("big zod dump with received values"), {
      name: "ZodError",
      issues: [{ code: "invalid_type", path: ["settings", "width"] }],
    });
    expect(rebuildErrorValue(err)).toBe("zod invalid_type at settings.width");
  });
  it("replaces unvettable zod path segments with a tilde", () => {
    const err = Object.assign(new Error("dump"), {
      name: "ZodError",
      issues: [{ code: "invalid_type", path: ["files", "user secret.pdf", 0] }],
    });
    expect(rebuildErrorValue(err)).toBe("zod invalid_type at files.~.0");
  });
  it("keeps a redacted message for an unknown Error, null only for non-objects", () => {
    // Was type-only before the fallback ladder; now the message survives, redacted.
    expect(rebuildErrorValue(new Error("user file /tmp/x.pdf broke"))).toBe(
      "user file <path> broke",
    );
    expect(rebuildErrorValue("string")).toBeNull();
    expect(rebuildErrorValue(null)).toBeNull();
  });
  it("discards hostile names on the status branch", () => {
    const err = Object.assign(new Error("upstream said no"), {
      name: "Bad Gateway https://internal.host/path",
      status: 502,
    });
    expect(rebuildErrorValue(err)).toBe("HttpError 502");
  });
  it("keeps the redacted message for a circular cause chain without hanging", () => {
    const err = new Error("loop") as Error & { cause?: unknown };
    err.cause = err;
    // chain()'s max cap breaks the cycle; the top message still surfaces.
    expect(rebuildErrorValue(err)).toBe("loop");
  });
});

describe("rebuildErrorValue ladder", () => {
  it("keeps a redacted message for an unknown error (was type-only)", () => {
    expect(rebuildErrorValue(new Error("Background removal failed"))).toBe(
      "Background removal failed",
    );
    expect(rebuildErrorValue(new Error("open /data/uploads/9f/in.bin"))).toBe("open <path>");
  });

  it("redacts a SafeError message (NODE-4W path leak)", () => {
    const e = new SafeError("[Errno 13] Permission denied: '/root/.u2net/x.onnx'", { kind: "bug" });
    expect(rebuildErrorValue(e)).toBe("[Errno 13] Permission denied: '<path>'");
  });

  it("appends the redacted cause to a SafeError title (NODE-3D)", () => {
    const cause = new Error("unsupported image format for /data/x.heic");
    const e = new SafeError("Image conversion failed", { kind: "bug", cause });
    expect(rebuildErrorValue(e)).toBe(
      "Image conversion failed: unsupported image format for <path>",
    );
  });

  it("derives a frame title for an empty-message error (NODE-3C)", () => {
    const e = new Error("");
    e.stack = "Error\n    at Object.process (/app/apps/api/src/routes/tools/rounded-crop.ts:96:10)";
    expect(rebuildErrorValue(e)).toBe("at rounded-crop.ts:96");
  });

  it("still prefers a pg SQLSTATE rebuild over the raw message", () => {
    const e = Object.assign(new Error(`password authentication failed for user "x"`), {
      code: "28P01",
      routine: "auth_failed",
    });
    expect(rebuildErrorValue(e)).toBe("pg 28P01 auth_failed");
  });

  it("returns null only when there is no message and no stack", () => {
    expect(rebuildErrorValue({ name: "Weird" })).toBeNull();
  });

  it("handles a pathological stack without catastrophic backtracking", () => {
    const e = new Error("");
    e.stack = `Error\n    at x (/apps/${".".repeat(100000)})`;
    const start = performance.now();
    const out = rebuildErrorValue(e);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(out).toBeNull();
  });
});

describe("rebuildErrorValue ffmpeg/ffprobe failures (#2455)", () => {
  const progress =
    "frame=  10 fps=0.0 q=28.0 size=1kB time=00:00:01.00 bitrate=8.2kbits/s speed=1x\r";

  it("surfaces the failure line after leading frame progress instead of front-truncating it", () => {
    const message = `ffmpeg exited 1: ${progress.repeat(20)}\n[out#0/mp4 @ 0x55d0] Error muxing a packet\nConversion failed!`;
    const out = rebuildErrorValue(new Error(message));
    expect(out).toContain("Error muxing a packet");
    expect(out).not.toContain("frame=");
    expect(out?.startsWith("ffmpeg exited 1: ")).toBe(true);
  });

  it("surfaces the root cause that precedes ffmpeg's generic shutdown cascade", () => {
    // Captured from ffmpeg 8.1.2: the actionable line is first, then the
    // thread/encoder shutdown boilerplate, then progress and "Conversion failed!".
    const stderr = [
      "[libx264 @ 0x55d0] width not divisible by 2 (99x99)",
      "[vost#0:0/libx264 @ 0x55d0] [enc:libx264 @ 0x55d0] Error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height.",
      "[vf#0:0 @ 0x55d0] Error sending frames to consumers: Generic error in an external library",
      "[vf#0:0 @ 0x55d0] Task finished with error code: -542398533 (Generic error in an external library)",
      "[vf#0:0 @ 0x55d0] Terminating thread with return code -542398533 (Generic error in an external library)",
      "[vost#0:0/libx264 @ 0x55d0] [enc:libx264 @ 0x55d0] Could not open encoder before EOF",
      "[vost#0:0/libx264 @ 0x55d0] Task finished with error code: -22 (Invalid argument)",
      "[vost#0:0/libx264 @ 0x55d0] Terminating thread with return code -22 (Invalid argument)",
      "[out#0/mp4 @ 0x55d0] Nothing was written into output file, because at least one of its streams received no packets.",
      progress.trim(),
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 187: ${stderr}`));
    expect(out).toContain("width not divisible by 2");
    expect(out).toContain("Error while opening encoder");
    expect(out).not.toContain("Terminating thread");
    expect(out).not.toContain("Nothing was written");
    expect(out).not.toContain("frame=");
  });

  it("drops stream metadata, its user-tag rows, and post-run encoder statistics", () => {
    const stderr = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/data/uploads/9f/in.mp4':",
      "  Metadata:",
      "    major_brand     : isom",
      "    title           : Q4 Board Deck",
      "    comment         : CONFIDENTIAL acquisition memo",
      "    encoder         : Lavf61.19.101",
      "  Duration: 00:00:10.00, start: 0.000000, bitrate: 300 kb/s",
      "  Stream #0:0(und): Video: h264, yuv420p, 1920x1080",
      "    Side data:",
      "      cpb: bitrate max/min/avg: 0/0/0 buffer size: 0 vbv_delay: N/A",
      "[libx264 @ 0x55d0] frame I:1     Avg QP:20.00  size: 1000",
      "[libx264 @ 0x55d0] frame P:29    Avg QP:22.00  size: 300",
      "[libx264 @ 0x55d0] mb I  I16..4: 20.0%  0.0% 80.0%",
      "[libx264 @ 0x55d0] 8x8 transform intra:70.0% inter:75.0%",
      "[libx264 @ 0x55d0] ref P L0: 70.0% 30.0%",
      "[libx264 @ 0x55d0] kb/s:300.00",
      "[aac @ 0x55d0] Qavg: 1234.567",
      "[out#0/mp4 @ 0x55d0] video:100kB audio:10kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: 1.0%",
      "[AVIOContext @ 0x55d0] Statistics: 12345 bytes read, 2 seeks",
      "[out#0/mp4 @ 0x55d0] Error closing file: Broken pipe",
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 1: ${stderr}`));
    expect(out).toContain("Error closing file: Broken pipe");
    for (const noise of [
      "Q4 Board Deck",
      "CONFIDENTIAL",
      "Lavf61",
      "Side data",
      "cpb:",
      "major_brand",
      "frame I:",
      "kb/s:",
    ]) {
      expect(out).not.toContain(noise);
    }
  });

  it("keeps an early 'Unknown encoder' failure past x264 stats and startup lines", () => {
    const stderr = [
      "Unknown encoder 'libbogus'",
      "[libx264 @ 0x55d0] profile High, level 3.1, 4:2:0, 8-bit",
      "[libx264 @ 0x55d0] using cpu capabilities: ARMv8 NEON",
      "[libx264 @ 0x55d0] 264 - core 164 r3108",
      "[libx264 @ 0x55d0] frame I:1     Avg QP:20.00  size: 1000",
      "[libx264 @ 0x55d0] i8 v,h,dc,p: 42%  0% 58%  0%",
      "[libx264 @ 0x55d0] i4 v,h,dc,ddl,ddr,vr,hd,vl,hu: 20% 18% 22% 7% 7% 7% 7% 6% 6%",
      "[libx264 @ 0x55d0] Weighted P-Frames: Y:0.0% UV:0.0%",
      "[libx264 @ 0x55d0] kb/s:300.00",
    ].join("\n");
    expect(rebuildErrorValue(new Error(`ffmpeg exited 3: ${stderr}`))).toBe(
      "ffmpeg exited 3: Unknown encoder 'libbogus'",
    );
  });

  it("filters audio-only size= progress so the decode error survives", () => {
    const stderr = [
      "[aist#0:0/pcm_s16le @ 0x55d0] Invalid PCM packet, data has size 1 but at least a size of 2 was expected",
      "size=      40KiB time=00:00:05.00 bitrate=  64.9kbits/s speed= 213x elapsed=0:00:00.02",
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 1: ${stderr}`));
    expect(out).toContain("Invalid PCM packet");
    expect(out).not.toContain("size=");
  });

  it("dedupes repeated decode errors so a later mux failure still fits", () => {
    const stderr = [
      ...Array.from(
        { length: 50 },
        (_, i) =>
          `[h264 @ 0x${(i + 1).toString(16)}] Error while decoding stream #0:0: Invalid data found when processing input`,
      ),
      "[out#0/mp4 @ 0x55d0] Error muxing a packet",
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 1: ${stderr}`));
    expect(out?.match(/Error while decoding/g)).toHaveLength(1);
    expect(out).toContain("Error muxing a packet");
  });

  it("drops no-colon thread termination lines before they can win a slot", () => {
    const stderr = [
      "[Parsed_extractplanes_1 @ 0x55d0] Requested planes not available.",
      "[Parsed_extractplanes_1 @ 0x55d0] Failed to configure input pad on Parsed_extractplanes_1",
      "[vf#0:0 @ 0x55d0] Error reinitializing filters!",
      "[vf#0:0 @ 0x55d0] Task finished with error code: -22 (Invalid argument)",
      "[vf#0:0 @ 0x55d0] Terminating thread with return code -22 (Invalid argument)",
      "[vost#0:0/libx264 @ 0x55d0] Terminating thread with return code -22 (Invalid argument)",
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 234: ${stderr}`));
    expect(out).toContain("Requested planes not available");
    expect(out).not.toContain("Terminating thread");
    expect(out).not.toContain("Task finished");
  });

  it("ranks a specific option error above generic follow-ups", () => {
    const stderr = [
      "Unrecognized option 'bogusopt'.",
      "Error splitting the argument list: Option not found",
      "Conversion failed!",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffmpeg exited 1: ${stderr}`)) ?? "";
    expect(out).toContain("Unrecognized option 'bogusopt'.");
    expect(out.indexOf("Unrecognized option")).toBeLessThan(
      out.indexOf("Error splitting the argument list"),
    );
  });

  it("does not backtrack catastrophically on repeated bracket prefixes", () => {
    const hostile = `ffmpeg exited 1: ${"[a @ b @ c] ".repeat(1000)}x`;
    const start = performance.now();
    const out = rebuildErrorValue(new Error(hostile));
    expect(performance.now() - start).toBeLessThan(200);
    expect(out?.startsWith("ffmpeg exited 1:")).toBe(true);
  });

  it("summarizes ffprobe failures the same way", () => {
    const stderr = [
      "[mov,mp4,m4a @ 0x55d0] moov atom not found",
      "/data/uploads/9f/in.mp4: Invalid data found when processing input",
    ].join("\n");
    const out = rebuildErrorValue(new Error(`ffprobe exited 2: ${stderr}`));
    expect(out).toContain("Invalid data found when processing input");
    expect(out).toContain("moov atom not found");
    expect(out?.startsWith("ffprobe exited 2: ")).toBe(true);
  });

  it("returns the bare exit prefix when stderr is only progress noise", () => {
    expect(rebuildErrorValue(new Error(`ffmpeg exited 1: ${progress.repeat(100)}`))).toBe(
      "ffmpeg exited 1",
    );
  });

  it("tail-slices a long failure line so its end (the actual error) survives", () => {
    const stderr = `[out#0/mp4] ${"x".repeat(500)} Error muxing a packet`;
    const out = rebuildErrorValue(new Error(`ffmpeg exited 1: ${stderr}`));
    expect(out?.endsWith("Error muxing a packet")).toBe(true);
  });

  it("redacts paths in the selected failure lines", () => {
    const out = rebuildErrorValue(
      new Error(
        "ffmpeg exited 1: /data/uploads/9f/in.mp4: Invalid data found when processing input",
      ),
    );
    expect(out).toContain("Invalid data found when processing input");
    expect(out).not.toContain("/data/");
  });
});

describe("extractErrorCode", () => {
  it("finds a pg SQLSTATE through a drizzle-style cause chain", () => {
    const pg = Object.assign(new Error("password authentication failed"), {
      code: "28P01",
      severity: "FATAL",
    });
    const wrapped = Object.assign(new Error("Failed query: select 1"), { cause: pg });
    expect(extractErrorCode(wrapped)).toBe("28P01");
  });
  it("finds a node syscall code nested in the chain", () => {
    const net = Object.assign(new Error("getaddrinfo ENOTFOUND db"), { code: "ENOTFOUND" });
    const wrapped = Object.assign(new Error("connect failed"), { cause: net });
    expect(extractErrorCode(wrapped)).toBe("ENOTFOUND");
  });
  it("prefers a pg SQLSTATE over an earlier non-standard code", () => {
    const pg = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const wrapped = Object.assign(new Error("wrap"), { code: "generic", cause: pg });
    expect(extractErrorCode(wrapped)).toBe("40P01");
  });
  it("falls back to a SafeError's authored code when no pg/node code is present", () => {
    const err = new SafeError("Python script timed out", { kind: "operational", code: "timeout" });
    expect(extractErrorCode(err)).toBe("timeout");
  });
  // #1413: a SafeError's code is authored to keep grouping stable, so it has
  // to win over whatever it wraps, or one condition splits by its cause.
  it("prefers a SafeError's own code over a node errno it wraps", () => {
    const err = new SafeError("Input file is no longer available. Upload it again.", {
      kind: "operational",
      code: "INPUT_MISSING",
      cause: sysErr("ENOENT", "open"),
    });
    expect(extractErrorCode(err)).toBe("INPUT_MISSING");
  });
  it("prefers a SafeError's own code over a pg SQLSTATE it wraps", () => {
    const pg = Object.assign(new Error("permission denied for table jobs"), { code: "42501" });
    const err = new SafeError("role lacks privileges", {
      kind: "operational",
      code: "migration-role-not-owner",
      cause: pg,
    });
    expect(extractErrorCode(err)).toBe("migration-role-not-owner");
  });
  it("honors the code on a marker-copied SafeError too", () => {
    const copied = Object.assign(new Error("copied across a module boundary"), {
      isSafeMessage: true,
      code: "install-lock-perms",
      cause: sysErr("EACCES", "fchmod"),
    });
    expect(extractErrorCode(copied)).toBe("install-lock-perms");
  });
  it("keeps the wrapped errno for a bug-kind SafeError, whose code is not a grouping key", () => {
    // withImageEncodeContext wraps with kind "bug" and a settings-derived code
    // (the output format); ENOSPC or a missing encoder binary is the clue.
    const encode = new SafeError("Image encode failed", {
      kind: "bug",
      code: "psd",
      cause: sysErr("ENOSPC", "write"),
    });
    expect(extractErrorCode(encode)).toBe("ENOSPC");
    // With nothing better in the chain, its own code is still the fallback.
    const plain = new SafeError("Image encode failed", {
      kind: "bug",
      code: "psd",
      cause: new Error("vips failed"),
    });
    expect(extractErrorCode(plain)).toBe("psd");
  });
  it("ignores a non-string or empty code on a marker-copied SafeError", () => {
    for (const code of [42, ""]) {
      const copied = Object.assign(new Error("copied"), {
        isSafeMessage: true,
        code,
        cause: sysErr("ENOENT"),
      });
      expect(extractErrorCode(copied)).toBe("ENOENT");
    }
  });
  it("still walks the chain for a SafeError with no usable code of its own", () => {
    const noCode = new SafeError("wrapped", { kind: "operational", cause: sysErr("ENOENT") });
    expect(extractErrorCode(noCode)).toBe("ENOENT");
    const tooLong = new SafeError("wrapped", {
      kind: "operational",
      code: "x".repeat(41),
      cause: sysErr("EACCES"),
    });
    expect(extractErrorCode(tooLong)).toBe("EACCES");
  });
  it("returns null when no code exists anywhere in the chain", () => {
    expect(extractErrorCode(new Error("plain boom"))).toBeNull();
    expect(extractErrorCode("string")).toBeNull();
    expect(extractErrorCode(null)).toBeNull();
  });
  it("returns null when a cause getter throws (hostile)", () => {
    const hostile = new Error("boom");
    Object.defineProperty(hostile, "cause", {
      get() {
        throw new Error("gotcha");
      },
    });
    expect(extractErrorCode(hostile)).toBeNull();
  });
});

describe("connectivityClass", () => {
  it("classifies pg-unavailable via SQLSTATE 08/57P and drizzle wrapping", () => {
    const pg = Object.assign(new Error("terminating connection"), { code: "57P01" });
    expect(connectivityClass(Object.assign(new Error("Failed query: x"), { cause: pg }))).toBe(
      "pg-unavailable",
    );
  });
  it("classifies ECONN* under pg when the chain looks like pg, else net", () => {
    const conn = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    expect(connectivityClass(Object.assign(new Error("Failed query: y"), { cause: conn }))).toBe(
      "pg-unavailable",
    );
    expect(connectivityClass(conn)).toBe("net-unavailable");
  });
  it.each([
    ["a connect timeout", "UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"],
    ["a closed socket", "UND_ERR_SOCKET", "other side closed"],
  ])("classifies an undici fetch failure from %s as net-unavailable (#1908)", (_l, code, msg) => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error(msg), { code }) });
    expect(connectivityClass(err)).toBe("net-unavailable");
  });
  it.each(["ENETUNREACH", "EHOSTUNREACH"])(
    "classifies a fetch that hit %s as net-unavailable (#1992)",
    (code) => {
      const err = new TypeError("fetch failed", {
        cause: Object.assign(new Error(`connect ${code} 10.0.0.1:443`), { code }),
      });
      expect(connectivityClass(err)).toBe("net-unavailable");
    },
  );
  it("classifies ENETUNREACH under a pg wrapper as pg-unavailable (#1992)", () => {
    const conn = Object.assign(new Error("connect ENETUNREACH 10.0.0.1:5432"), {
      code: "ENETUNREACH",
    });
    expect(connectivityClass(Object.assign(new Error("Failed query: z"), { cause: conn }))).toBe(
      "pg-unavailable",
    );
  });
  it("leaves undici's other codes (header/body timeouts, aborts) unclassified", () => {
    for (const code of ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_ABORTED"]) {
      const err = new TypeError("fetch failed", {
        cause: Object.assign(new Error(code), { code }),
      });
      expect(connectivityClass(err)).toBeNull();
    }
  });
  it("classifies Smithy S3 connection and socket TimeoutError rejections with $metadata and no code as net-unavailable (#2774)", () => {
    const socketTimeout = Object.assign(
      new Error(
        "@smithy/node-http-handler - the request socket timed out after 30000 ms of inactivity",
      ),
      { name: "TimeoutError", $metadata: { attempts: 3 } },
    );
    const connTimeout = Object.assign(
      new Error(
        "@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of 10000 ms.",
      ),
      { name: "TimeoutError", $metadata: { attempts: 3 } },
    );
    expect(connectivityClass(socketTimeout)).toBe("net-unavailable");
    expect(connectivityClass(connTimeout)).toBe("net-unavailable");
    expect(connectivityClass(new Error("S3 read failed", { cause: socketTimeout }))).toBe(
      "net-unavailable",
    );
  });
  it("leaves a bare TimeoutError without $metadata or a non-TimeoutError with $metadata unclassified (#2774)", () => {
    expect(
      connectivityClass(
        new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      ),
    ).toBeNull();
    expect(
      connectivityClass(Object.assign(new Error("Request timed out"), { name: "TimeoutError" })),
    ).toBeNull();
    expect(
      connectivityClass(
        Object.assign(new Error("The specified key does not exist."), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        }),
      ),
    ).toBeNull();
  });
  it("classifies ioredis connection loss as redis-unavailable", () => {
    const err = Object.assign(new Error("Connection is closed."), {
      name: "MaxRetriesPerRequestError",
    });
    expect(connectivityClass(err)).toBe("redis-unavailable");
  });
  it("returns null for ordinary errors and ReplyError", () => {
    expect(connectivityClass(new Error("nope"))).toBeNull();
    expect(
      connectivityClass(Object.assign(new Error("ERR unknown command"), { name: "ReplyError" })),
    ).toBeNull();
  });
});

describe("isEnvironmentalDbError", () => {
  // The code lives on the inner pg error; chain() walks `cause`, so the shape a
  // drizzle caller actually sees is the wrapped one.
  const pgCause = (code: string) =>
    Object.assign(new Error(`pg ${code}`), { code, severity: "ERROR", routine: "mdopenfork" });

  it("treats a damaged data directory (class 58) as environmental (#4202)", () => {
    for (const code of ["58P01", "58P02", "58030"]) {
      const err = Object.assign(new Error("Failed query: select * from jobs"), {
        name: "DrizzleQueryError",
        cause: pgCause(code),
      });
      expect(isEnvironmentalDbError(err)).toBe(true);
    }
  });

  it("keeps an ordinary query error (class 42) a bug", () => {
    const err = Object.assign(new Error("Failed query: select"), {
      name: "DrizzleQueryError",
      cause: pgCause("42601"),
    });
    expect(isEnvironmentalDbError(err)).toBe(false);
  });
});

describe("isClientAbort", () => {
  it("matches abort/premature-close/reset shapes", () => {
    expect(isClientAbort(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))).toBe(true);
    expect(
      isClientAbort(
        Object.assign(new Error("premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
      ),
    ).toBe(true);
    expect(
      isClientAbort(Object.assign(new Error("request aborted"), { name: "RequestAbortedError" })),
    ).toBe(true);
    expect(isClientAbort(new Error("boom"))).toBe(false);
  });
  it("treats a top-level bare ECONNRESET as a client abort", () => {
    const err = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    expect(isClientAbort(err)).toBe(true);
  });
  it("does not treat a drizzle-wrapped pg ECONNRESET as a client abort", () => {
    const conn = Object.assign(new Error("connect ECONNRESET 127.0.0.1:5432"), {
      code: "ECONNRESET",
    });
    const wrapped = Object.assign(new Error("Failed query: z"), { cause: conn });
    expect(isClientAbort(wrapped)).toBe(false);
    expect(connectivityClass(wrapped)).toBe("pg-unavailable");
  });
  it("does not treat a top-level Postgres/Drizzle ECONNRESET or pg chain with abort-shaped message as a client abort (#3697)", () => {
    const topPgReset = Object.assign(new Error("read ECONNRESET"), {
      name: "PostgresError",
      code: "ECONNRESET",
      syscall: "read",
    });
    const topDbReset = Object.assign(new Error("read ECONNRESET"), {
      name: "DatabaseError",
      code: "ECONNRESET",
      syscall: "read",
    });
    const topSeverityReset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      severity: "FATAL",
    });
    const topDrizzleReset = Object.assign(new Error("Failed query: select 1"), {
      code: "ECONNRESET",
    });
    const topDrizzleClassReset = Object.assign(new Error("read ECONNRESET"), {
      name: "DrizzleQueryError",
      code: "ECONNRESET",
    });
    const wrappedAbortMsg = Object.assign(new Error("Failed query: select 1"), {
      cause: Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
    });
    for (const err of [
      topPgReset,
      topDbReset,
      topSeverityReset,
      topDrizzleReset,
      topDrizzleClassReset,
      wrappedAbortMsg,
    ]) {
      expect(isClientAbort(err)).toBe(false);
      expect(connectivityClass(err)).toBe("pg-unavailable");
    }
  });
});

describe("hostile error shapes", () => {
  it("returns the fallback from all three exports when a cause getter throws", () => {
    const hostile = new Error("boom");
    Object.defineProperty(hostile, "cause", {
      get() {
        throw new Error("gotcha");
      },
    });
    expect(rebuildErrorValue(hostile)).toBeNull();
    expect(connectivityClass(hostile)).toBeNull();
    expect(isClientAbort(hostile)).toBe(false);
  });
});
