import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectAvx,
  parseCpuFlags,
  resetCpuFeatureCache,
} from "../../../apps/api/src/lib/cpu-features.js";

// Trimmed /proc/cpuinfo from real hosts: one core with AVX2, and an old
// Westmere-era Xeon without AVX (the kind behind Sentry NODE-AC).
const WITH_AVX = `processor\t: 0
vendor_id\t: GenuineIntel
model name\t: Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz
flags\t\t: fpu vme de pse tsc msr pae mce cx8 sse sse2 ssse3 sse4_1 sse4_2 popcnt aes xsave avx f16c rdrand avx2 bmi2
bugs\t\t: spectre_v1

processor\t: 1
flags\t\t: fpu vme de pse tsc msr pae mce cx8 sse sse2 ssse3 sse4_1 sse4_2 popcnt aes xsave avx f16c rdrand avx2 bmi2
`;
const WITHOUT_AVX = `processor\t: 0
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU X5670 @ 2.93GHz
flags\t\t: fpu vme de pse tsc msr pae mce cx8 sse sse2 ssse3 sse4_1 sse4_2 popcnt aes lahf_lm
`;
// AMD reports avx512 variants and "avx_vnni" style names; only the bare token counts.
const LOOKALIKES_ONLY = "flags\t\t: fpu sse sse2 avx512_fake avx_vnni\n";
const ARM64 = "processor\t: 0\nFeatures\t: fp asimd evtstrm aes pmull sha1 sha2 crc32\n";

const x64 = (cpuinfo: string) => ({ arch: "x64", readCpuinfo: () => cpuinfo });

describe("parseCpuFlags", () => {
  it("reads the first flags line", () => {
    const flags = parseCpuFlags(WITH_AVX);
    expect(flags?.has("avx")).toBe(true);
    expect(flags?.has("avx2")).toBe(true);
    expect(flags?.has("bugs")).toBe(false);
  });

  it("returns null when there is no flags line", () => {
    expect(parseCpuFlags(ARM64)).toBeNull();
    expect(parseCpuFlags("")).toBeNull();
  });
});

describe("detectAvx", () => {
  it("finds AVX on an x86-64 CPU that has it", () => {
    expect(detectAvx(x64(WITH_AVX))).toBe(true);
  });

  it("reports no AVX on an x86-64 CPU that lacks it", () => {
    expect(detectAvx(x64(WITHOUT_AVX))).toBe(false);
    expect(detectAvx(x64(LOOKALIKES_ONLY))).toBe(false);
  });

  it("is unknown, never false, off x86-64", () => {
    const readCpuinfo = vi.fn(() => WITHOUT_AVX);
    expect(detectAvx({ arch: "arm64", readCpuinfo })).toBeNull();
    expect(readCpuinfo).not.toHaveBeenCalled();
  });

  it("is unknown when /proc/cpuinfo can't be read or has no flags", () => {
    const unreadable = () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    expect(detectAvx({ arch: "x64", readCpuinfo: unreadable })).toBeNull();
    expect(detectAvx(x64("processor\t: 0\n"))).toBeNull();
  });
});

describe("hostLacksAvx", () => {
  const realArch = process.arch;
  afterEach(() => {
    Object.defineProperty(process, "arch", { value: realArch });
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  // The default probe captures process.arch at import, so pose as x86-64 first.
  async function loadWith(cpuinfo: string | Error, arch = "x64") {
    Object.defineProperty(process, "arch", { value: arch });
    vi.resetModules();
    const readFileSync = vi.fn(() => {
      if (cpuinfo instanceof Error) throw cpuinfo;
      return cpuinfo;
    });
    vi.doMock("node:fs", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs")>()),
      readFileSync,
    }));
    const mod = await import("../../../apps/api/src/lib/cpu-features.js");
    return { mod, readFileSync };
  }

  it("is true for a known AVX-less CPU, read once", async () => {
    const { mod, readFileSync } = await loadWith(WITHOUT_AVX);
    expect(mod.hostLacksAvx()).toBe(true);
    expect(mod.hostLacksAvx()).toBe(true);
    expect(readFileSync).toHaveBeenCalledTimes(1);
    mod.resetCpuFeatureCache();
    expect(mod.hostLacksAvx()).toBe(true);
    expect(readFileSync).toHaveBeenCalledTimes(2);
  });

  it("is false when the CPU can't be probed", async () => {
    const { mod } = await loadWith(new Error("EACCES"));
    expect(mod.hostLacksAvx()).toBe(false);
  });

  it("is false for a CPU with AVX", async () => {
    const { mod } = await loadWith(WITH_AVX);
    expect(mod.hostLacksAvx()).toBe(false);
  });

  it("is false on arm64 without reading /proc/cpuinfo", async () => {
    const { mod, readFileSync } = await loadWith(WITHOUT_AVX, "arm64");
    expect(mod.hostLacksAvx()).toBe(false);
    expect(readFileSync).not.toHaveBeenCalled();
  });
});

afterEach(() => resetCpuFeatureCache());
