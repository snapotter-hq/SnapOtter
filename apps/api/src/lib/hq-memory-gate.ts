import { readFileSync } from "node:fs";
import { freemem } from "node:os";

// Measured on an amd64 CPU host (#670): SD1.5 inpainting is OOM-killed at the
// stock 6g compose limit and completes at 8g (503s). GPU hosts run it in VRAM,
// so only CPU inference needs this floor.
const HQ_CPU_MIN_MEMORY_BYTES = 7.5 * 1024 ** 3;

/** Effective cgroup memory limit, or null when unlimited or unknown (bare metal). */
export function containerMemoryLimitBytes(): number | null {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8").trim();
    } catch {
      continue;
    }
    if (raw === "max") return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    // cgroup v1 reports "unlimited" as a page-rounded near-2^63 sentinel.
    if (value >= 2 ** 60) return null;
    return value;
  }
  return null;
}

/** Refusal message when HQ inpainting cannot fit this container, else null. */
export function hqCpuMemoryRefusal(
  gpuAvailable: boolean,
  limitBytes: number | null,
): string | null {
  if (gpuAvailable || limitBytes === null || limitBytes >= HQ_CPU_MIN_MEMORY_BYTES) {
    return null;
  }
  const gib = (limitBytes / 1024 ** 3).toFixed(1);
  return (
    `HQ inpainting needs at least 8g of container memory on CPU hosts ` +
    `(this container is limited to ${gib}g). Raise mem_limit or use the fast quality mode.`
  );
}

/**
 * Peak memory of the birefnet-hr-matting path on CPU (#4510). The sidecar feeds
 * that model a fixed 2048x2048 input whatever the source size, so the peak does
 * not scale with the image. Measured peaks were 16.1 GB (50x50) and 20.9 GB
 * (572x1024). 25 GiB is the top of the 16 to 25 GB range reported there, so the
 * estimate sits above every run seen.
 */
export const HR_MATTING_CPU_ESTIMATE_BYTES = 25 * 1024 ** 3;

export const HR_MATTING_MEMORY_MESSAGE =
  "This image is too large for the memory available on this host. " +
  "High-resolution matting needs about 25 GB of free memory on a CPU host, so use a larger host.";

/**
 * Memory this process can still use: free memory, capped by the container limit
 * when there is one. The cap is a ceiling, not current usage, so it can overstate
 * what is free when other processes share the cgroup.
 */
export function availableMemoryBytes(): number {
  const free = freemem();
  const limit = containerMemoryLimitBytes();
  return limit === null ? free : Math.min(free, limit);
}

/** Refusal for high-resolution matting that would not fit in available memory, else null. */
export function hrMattingMemoryRefusal(
  gpuAvailable: boolean,
  availableBytes: number,
): string | null {
  if (gpuAvailable || availableBytes >= HR_MATTING_CPU_ESTIMATE_BYTES) return null;
  return HR_MATTING_MEMORY_MESSAGE;
}
