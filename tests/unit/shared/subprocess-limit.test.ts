import { afterEach, describe, expect, it } from "vitest";
import { wrapWithMemoryLimit } from "../../../packages/shared/src/subprocess-limit.js";

const KEY = "SUBPROCESS_MEMORY_LIMIT_MB";
const orig = process.env[KEY];

describe("wrapWithMemoryLimit", () => {
  afterEach(() => {
    if (orig === undefined) delete process.env[KEY];
    else process.env[KEY] = orig;
  });

  it("returns the command unchanged when the limit is unset (default)", () => {
    delete process.env[KEY];
    expect(wrapWithMemoryLimit("ffmpeg", ["-i", "a.mp4"])).toEqual(["ffmpeg", ["-i", "a.mp4"]]);
  });

  it("returns the command unchanged when the limit is 0 or non-numeric", () => {
    process.env[KEY] = "0";
    expect(wrapWithMemoryLimit("gs", ["-dSAFER"])).toEqual(["gs", ["-dSAFER"]]);
    process.env[KEY] = "not-a-number";
    expect(wrapWithMemoryLimit("gs", ["-dSAFER"])).toEqual(["gs", ["-dSAFER"]]);
  });

  it("wraps in an ulimit -v sh shim (limit in KB) when a positive MB limit is set", () => {
    process.env[KEY] = "512";
    const [bin, args] = wrapWithMemoryLimit("ffmpeg", ["-i", "in.mp4", "out.mp4"]);
    expect(bin).toBe("/bin/sh");
    expect(args[0]).toBe("-c");
    expect(args[1]).toContain("ulimit -v");
    expect(args[1]).toContain('exec "$@"');
    // sh -c <script> sh <kb> <realbin> <realargs...>
    expect(args.slice(2)).toEqual(["sh", String(512 * 1024), "ffmpeg", "-i", "in.mp4", "out.mp4"]);
  });

  it("passes user args positionally so a crafted arg is never re-parsed by the shell", () => {
    process.env[KEY] = "256";
    const [, args] = wrapWithMemoryLimit("gs", ["-sOutputFile=/x/$(whoami).pdf"]);
    // The metacharacter-laden value is a positional param, not part of the script body.
    expect(args[1]).not.toContain("whoami");
    expect(args).toContain("-sOutputFile=/x/$(whoami).pdf");
  });
});
