import { readFileSync } from "node:fs";

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
