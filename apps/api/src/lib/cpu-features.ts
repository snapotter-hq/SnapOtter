import { readFileSync } from "node:fs";

/**
 * Whether this host's CPU has AVX. Some AI bundles ship x86-64 wheels built
 * with AVX (MediaPipe's TFLite aborts with "compiled with avx enabled" on
 * first inference), so the feature routes refuse to install those bundles
 * here instead of letting a multi-GB download fail at the first job (#4680).
 *
 * `null` means unknown, and unknown never blocks: only an x86-64 Linux host
 * whose /proc/cpuinfo lists flags without `avx` reads as lacking it. arm64
 * wheels don't use AVX at all. Inside Docker, /proc/cpuinfo shows the host
 * CPU, which is the one the wheels run on.
 */
export interface CpuProbe {
  arch: string;
  readCpuinfo: () => string;
}

const defaultProbe: CpuProbe = {
  arch: process.arch,
  readCpuinfo: () => readFileSync("/proc/cpuinfo", "utf8"),
};

/** The CPU flags from the first `flags` line of /proc/cpuinfo, or null if there is none. */
export function parseCpuFlags(cpuinfo: string): Set<string> | null {
  const line = cpuinfo.split("\n").find((l) => /^flags\s*:/.test(l));
  if (!line) return null;
  return new Set(
    line
      .slice(line.indexOf(":") + 1)
      .trim()
      .split(/\s+/),
  );
}

export function detectAvx(probe: CpuProbe = defaultProbe): boolean | null {
  if (probe.arch !== "x64") return null;
  let cpuinfo: string;
  try {
    cpuinfo = probe.readCpuinfo();
  } catch {
    return null;
  }
  const flags = parseCpuFlags(cpuinfo);
  return flags ? flags.has("avx") : null;
}

let cachedHasAvx: boolean | null | undefined;

/** True only when this host is known to lack AVX. Detected once per process. */
export function hostLacksAvx(): boolean {
  if (cachedHasAvx === undefined) cachedHasAvx = detectAvx();
  return cachedHasAvx === false;
}

/** Test seam: drop the cached detection so the next call probes again. */
export function resetCpuFeatureCache(): void {
  cachedHasAvx = undefined;
}
