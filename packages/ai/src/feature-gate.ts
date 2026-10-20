import { readFileSync } from "node:fs";
import { totalmem } from "node:os";
import { join } from "node:path";
import { getRequiredBundlesForTool } from "@snapotter/shared";

const GIB = 1024 ** 3;

export type GpuFramework = "torch" | "onnx" | "ctranslate2";

export interface GpuFrameworks {
  torch?: boolean;
  onnx?: boolean;
  ctranslate2?: boolean;
}

/**
 * Python script name -> required feature bundle.
 *
 * This MUST mirror TOOL_BUNDLE_MAP in packages/ai/python/dispatcher.py. The
 * persistent dispatcher enforces this gate in Python; the per-request fallback
 * path (PythonDispatcher.runPerRequest) spawns scripts directly and would
 * otherwise bypass it, so it enforces the same gate here. A drift test keeps
 * the two maps in sync (tests/unit/ai/feature-gate.test.ts).
 */
export const SCRIPT_BUNDLE_MAP: Record<string, string> = {
  remove_bg: "background-removal",
  gif_remove_bg: "background-removal",
  detect_faces: "face-detection",
  face_landmarks: "face-detection",
  red_eye_removal: "face-detection",
  inpaint: "object-eraser-colorize",
  inpaint_hq: "inpaint-hq",
  outpaint: "object-eraser-colorize",
  colorize: "object-eraser-colorize",
  upscale: "upscale-enhance",
  enhance_faces: "upscale-enhance",
  noise_removal: "upscale-enhance",
  restore: "photo-restoration",
  transcribe: "transcription",
};

/**
 * User-facing tool label for each sidecar script in SCRIPT_BUNDLE_MAP, used
 * when reporting a pre-dispatch memory refusal.
 */
export const SCRIPT_TOOL_LABEL: Readonly<Record<string, string>> = {
  remove_bg: "remove-background",
  gif_remove_bg: "remove-gif-background",
  detect_faces: "blur-faces",
  face_landmarks: "passport-photo",
  red_eye_removal: "red-eye-removal",
  inpaint: "erase-object",
  inpaint_hq: "erase-object (HQ)",
  outpaint: "ai-canvas-expand",
  colorize: "colorize",
  upscale: "upscale",
  enhance_faces: "enhance-faces",
  noise_removal: "noise-removal",
  restore: "restore-photo",
  transcribe: "transcribe-audio",
};

/**
 * Minimum free/available memory (in bytes) required on a CPU host before
 * dispatching a script belonging to each AI feature bundle (#1162).
 *
 * MediaPipe face detection fits comfortably inside the 2 GB base tier (~0.5 GB
 * free). Whisper, LaMa/DDColor, rembg/BiRefNet, RealESRGAN/CodeFormer, and the
 * restoration pipeline require a 4 GB+ host (2 to 3 GB free); SD1.5 HQ
 * inpainting requires an 8 GB host/container on CPU (6 GB free, #670).
 * Accurate OCR runs in its own v3 runtime, which enforces its 4 GiB configured
 * memory floor in runtime-resources.ts; its 2 GiB entry here keeps the bundle
 * catalog map complete.
 */
export const BUNDLE_CPU_FREE_MEMORY_BYTES: Readonly<Record<string, number>> = {
  "face-detection": 0.5 * GIB,
  transcription: 2 * GIB,
  "object-eraser-colorize": 2 * GIB,
  ocr: 2 * GIB,
  "background-removal": 2.5 * GIB,
  "upscale-enhance": 2.5 * GIB,
  "photo-restoration": 3 * GIB,
  "inpaint-hq": 6 * GIB,
};

/**
 * GPU inference framework for each feature bundle. MediaPipe (`face-detection`)
 * and the portable CPU `ocr` runtime always run on CPU even when a CUDA GPU is
 * present (`null`), so their CPU memory floors are never bypassed by GPU state.
 */
export const BUNDLE_GPU_FRAMEWORK: Readonly<Record<string, GpuFramework | null>> = {
  "background-removal": "onnx",
  "face-detection": null,
  "object-eraser-colorize": "onnx",
  "inpaint-hq": "torch",
  "upscale-enhance": "torch",
  "photo-restoration": "onnx",
  ocr: null,
  transcription: "ctranslate2",
};

/**
 * GPU inference framework for each gated sidecar script in SCRIPT_BUNDLE_MAP.
 */
export const SCRIPT_GPU_FRAMEWORK: Readonly<Record<string, GpuFramework | null>> = {
  remove_bg: "onnx",
  gif_remove_bg: "onnx",
  detect_faces: null,
  face_landmarks: null,
  red_eye_removal: null,
  inpaint: "onnx",
  inpaint_hq: "torch",
  outpaint: "onnx",
  colorize: "onnx",
  upscale: "torch",
  enhance_faces: "torch",
  noise_removal: "torch",
  restore: "onnx",
  transcribe: "ctranslate2",
};

export interface SidecarMemoryOptions {
  /** Whether a usable CUDA GPU is available for inference. */
  gpuAvailable?: boolean;
  /** Per-framework CUDA availability reported by dispatcher.py at startup. */
  gpuFrameworks?: GpuFrameworks;
  /** Caller tool identifier when a script is shared or part of a multi-bundle tool. */
  toolId?: string;
  /** Direct override for available memory in bytes (test seam). */
  availableMemoryBytes?: number;
  /** Override for host total physical memory in bytes (test seam). */
  totalMemoryBytes?: number;
  /** File reader seam for /proc/meminfo and /sys/fs/cgroup files. */
  readTextFile?: (path: string) => string;
  /** Device node existence seam for cold-start NVIDIA device check. */
  deviceExists?: (path: string) => boolean;
}

/**
 * True when the given GPU framework can offload inference to VRAM. CPU-only
 * frameworks (`null`, e.g. MediaPipe) always return false. When `gpuFrameworks`
 * carries an explicit boolean for `framework`, that per-framework probe wins;
 * otherwise falls back to the aggregate `gpuAvailable` boolean.
 */
export function isFrameworkGpuAvailable(
  framework: GpuFramework | null | undefined,
  options: SidecarMemoryOptions = {},
): boolean {
  if (!framework) return false;
  const perFramework = options.gpuFrameworks?.[framework];
  if (typeof perFramework === "boolean") return perFramework;
  return Boolean(options.gpuAvailable);
}

function parseFiniteCgroupBytes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "max") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  // cgroup v1 reports "unlimited" as a page-rounded near-2^63 sentinel.
  if (value >= 2 ** 60) return null;
  return value;
}

function parseInactiveFileCacheBytes(statRaw: string): number {
  let v2Inactive: number | null = null;
  let v1TotalInactive: number | null = null;
  for (const line of statRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [key, rawVal] = trimmed.split(/\s+/);
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    if (key === "inactive_file") v2Inactive = parsed;
    else if (key === "total_inactive_file") v1TotalInactive = parsed;
  }
  return v1TotalInactive ?? v2Inactive ?? 0;
}

function readCgroupAvailableMemoryBytes(readTextFile: (path: string) => string): number | null {
  const layouts = [
    {
      limitPath: "/sys/fs/cgroup/memory.max",
      usagePath: "/sys/fs/cgroup/memory.current",
      statPath: "/sys/fs/cgroup/memory.stat",
    },
    {
      limitPath: "/sys/fs/cgroup/memory/memory.limit_in_bytes",
      usagePath: "/sys/fs/cgroup/memory/memory.usage_in_bytes",
      statPath: "/sys/fs/cgroup/memory/memory.stat",
    },
    {
      limitPath: "/sys/fs/cgroup/memory.limit_in_bytes",
      usagePath: "/sys/fs/cgroup/memory.usage_in_bytes",
      statPath: "/sys/fs/cgroup/memory.stat",
    },
  ] as const;

  for (const layout of layouts) {
    let limitRaw: string;
    try {
      limitRaw = readTextFile(layout.limitPath);
    } catch {
      continue;
    }
    const limit = parseFiniteCgroupBytes(limitRaw);
    if (limit === null) continue;

    let usage = 0;
    let hasUsage = false;
    try {
      const rawUsage = readTextFile(layout.usagePath).trim();
      const parsedUsage = rawUsage.length > 0 ? Number(rawUsage) : Number.NaN;
      if (Number.isFinite(parsedUsage) && parsedUsage >= 0) {
        usage = parsedUsage;
        hasUsage = true;
      }
    } catch {
      // Usage file absent or unreadable; fall back to the configured limit.
    }
    if (!hasUsage) return limit;

    let inactiveFile = 0;
    try {
      inactiveFile = parseInactiveFileCacheBytes(readTextFile(layout.statPath));
    } catch {
      // memory.stat absent; treat all current usage as active.
    }
    const activeUsage = Math.max(0, usage - inactiveFile);
    return Math.max(0, limit - activeUsage);
  }
  return null;
}

function readProcMemAvailableBytes(readTextFile: (path: string) => string): number | null {
  try {
    const raw = readTextFile("/proc/meminfo");
    const match = raw.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    if (!match) return null;
    const kb = Number(match[1]);
    return Number.isFinite(kb) && kb >= 0 ? kb * 1024 : null;
  } catch {
    return null;
  }
}

/**
 * Estimate memory currently available to a new Python sidecar workload, taking
 * the tighter of Linux host MemAvailable and the container's remaining cgroup
 * budget (with reclaimable file cache discounted).
 */
export function availableSidecarMemoryBytes(options: SidecarMemoryOptions = {}): number | null {
  if (options.availableMemoryBytes !== undefined) {
    return options.availableMemoryBytes;
  }
  const readTextFile = options.readTextFile ?? ((p: string) => readFileSync(p, "utf-8"));
  const total = options.totalMemoryBytes ?? totalmem();
  const procAvailable = readProcMemAvailableBytes(readTextFile);
  const cgroupAvailable = readCgroupAvailableMemoryBytes(readTextFile);

  let effective = Number.isFinite(total) && total > 0 ? total : Infinity;
  if (procAvailable !== null && procAvailable < effective) effective = procAvailable;
  if (cgroupAvailable !== null && cgroupAvailable < effective) effective = cgroupAvailable;
  return Number.isFinite(effective) ? effective : null;
}

function formatGb(bytes: number): string {
  const gb = bytes / GIB;
  const rounded = Math.round(gb * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}.0` : rounded.toFixed(1);
}

function formatFloorGb(bytes: number): string {
  const gb = bytes / GIB;
  const rounded = Math.round(gb * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Return an actionable refusal message when a gated AI script cannot run on
 * this CPU host without exhausting available memory, or null when dispatch may
 * proceed. GPU hosts skip the CPU floor because model weights and activations
 * reside in VRAM.
 */
export function sidecarMemoryRefusal(
  scriptName: string,
  options: SidecarMemoryOptions = {},
): string | null {
  const scriptKey = scriptName.replace(/\.py$/, "");
  const bundle = SCRIPT_BUNDLE_MAP[scriptKey];
  if (!bundle) return null;

  const toolId = options.toolId?.trim();
  const candidateBundles =
    toolId && bundle !== "inpaint-hq"
      ? [...new Set([bundle, ...getRequiredBundlesForTool(toolId)])]
      : [bundle];

  let requiredBytes = 0;
  for (const candidateBundle of candidateBundles) {
    const floor = BUNDLE_CPU_FREE_MEMORY_BYTES[candidateBundle] ?? 0;
    if (floor <= 0) continue;
    const framework =
      candidateBundle in BUNDLE_GPU_FRAMEWORK
        ? BUNDLE_GPU_FRAMEWORK[candidateBundle]
        : SCRIPT_GPU_FRAMEWORK[scriptKey];
    if (isFrameworkGpuAvailable(framework, options)) continue;
    if (floor > requiredBytes) requiredBytes = floor;
  }
  if (!requiredBytes) return null;

  const availableBytes = availableSidecarMemoryBytes(options);
  if (availableBytes === null || availableBytes >= requiredBytes) return null;

  const label = toolId || SCRIPT_TOOL_LABEL[scriptKey] || scriptKey;
  return (
    `${label} needs about ${formatFloorGb(requiredBytes)} GB free on CPU hosts, ` +
    `this host has ${formatGb(availableBytes)} GB. Free up memory, raise the container memory limit, or use a CUDA GPU.`
  );
}

/** Bundle ids currently recorded as installed in DATA_DIR/ai/installed.json. */
function installedBundles(): Set<string> {
  // Resolve DATA_DIR the same way the API config does for native checkouts.
  // Docker images set DATA_DIR=/data explicitly.
  const installedPath = join(process.env.DATA_DIR || "./data", "ai", "installed.json");
  try {
    const data = JSON.parse(readFileSync(installedPath, "utf-8")) as {
      bundles?: Record<string, unknown>;
    };
    return new Set(Object.keys(data.bundles ?? {}));
  } catch {
    // Fail closed, exactly like dispatcher._get_installed_bundles(): a missing
    // or unreadable installed.json reads as "nothing installed".
    return new Set();
  }
}

/**
 * The feature bundle a script requires if that bundle is NOT installed, else
 * null. Returns null for ungated scripts (e.g. doc-profile scripts) and for
 * gated scripts whose bundle is installed. Mirrors the dispatcher's gate so the
 * fallback path behaves identically whether or not the dispatcher is running.
 *
 * Accepts the script name with or without a ".py" suffix.
 */
export function missingBundleForScript(scriptName: string): string | null {
  const bundle = SCRIPT_BUNDLE_MAP[scriptName.replace(/\.py$/, "")];
  if (!bundle) return null;
  return installedBundles().has(bundle) ? null : bundle;
}
