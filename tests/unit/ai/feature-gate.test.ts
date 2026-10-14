import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  availableSidecarMemoryBytes,
  BUNDLE_CPU_FREE_MEMORY_BYTES,
  missingBundleForScript,
  SCRIPT_BUNDLE_MAP,
  SCRIPT_TOOL_LABEL,
  sidecarMemoryRefusal,
} from "../../../packages/ai/src/feature-gate.js";
import { FEATURE_BUNDLES } from "../../../packages/shared/src/features.js";

let tempDir: string;
let savedDataDir: string | undefined;
let savedCwd: string;

beforeEach(() => {
  savedDataDir = process.env.DATA_DIR;
  savedCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-gate-"));
  mkdirSync(join(tempDir, "ai"), { recursive: true });
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  process.chdir(savedCwd);
  if (savedDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = savedDataDir;
  rmSync(tempDir, { recursive: true, force: true });
});

function setInstalled(bundleIds: string[]): void {
  const bundles: Record<string, { version: string; installedAt: string; models: string[] }> = {};
  for (const id of bundleIds) {
    bundles[id] = { version: "1.0.0-test", installedAt: "2026-01-01T00:00:00.000Z", models: [] };
  }
  writeFileSync(join(tempDir, "ai", "installed.json"), JSON.stringify({ bundles }), "utf-8");
}

describe("missingBundleForScript", () => {
  it("returns the bundle when a gated script's bundle is not installed", () => {
    setInstalled([]);
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
    expect(missingBundleForScript("remove_bg")).toBe("background-removal");
  });

  it("returns null when the gated script's bundle is installed", () => {
    setInstalled(["face-detection"]);
    expect(missingBundleForScript("face_landmarks")).toBeNull();
  });

  it("handles a .py suffix", () => {
    setInstalled(["background-removal"]);
    expect(missingBundleForScript("remove_bg.py")).toBeNull();
    setInstalled([]);
    expect(missingBundleForScript("remove_bg.py")).toBe("background-removal");
  });

  it("returns null for ungated scripts", () => {
    setInstalled([]);
    expect(missingBundleForScript("doc_text")).toBeNull();
    expect(missingBundleForScript("unknown_script")).toBeNull();
  });

  it("does not gate built-in OCR through the legacy shared environment", () => {
    setInstalled([]);

    expect(SCRIPT_BUNDLE_MAP).not.toHaveProperty("ocr");
    expect(SCRIPT_BUNDLE_MAP).not.toHaveProperty("ocr_pdf");
    expect(missingBundleForScript("ocr")).toBeNull();
    expect(missingBundleForScript("ocr_pdf.py")).toBeNull();
  });

  it("fails closed when installed.json is missing", () => {
    // No setInstalled(): the file does not exist. Like the dispatcher, an
    // unreadable installed.json reads as "nothing installed", so a gated
    // script is blocked.
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
  });

  it("fails closed when installed.json is corrupt", () => {
    writeFileSync(join(tempDir, "ai", "installed.json"), "{{{not json", "utf-8");
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
  });

  it("gates both of passport-photo's scripts (issue #327)", () => {
    setInstalled(["background-removal"]); // face-detection still missing
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
    expect(missingBundleForScript("remove_bg")).toBeNull();
  });

  it("uses the native ./data fallback when DATA_DIR is unset", () => {
    delete process.env.DATA_DIR;
    process.chdir(tempDir);
    const defaultAiDir = join(tempDir, "data", "ai");
    mkdirSync(defaultAiDir, { recursive: true });
    writeFileSync(
      join(defaultAiDir, "installed.json"),
      JSON.stringify({
        bundles: {
          "object-eraser-colorize": {
            version: "1.0.0-test",
            installedAt: "2026-01-01T00:00:00.000Z",
            models: [],
          },
        },
      }),
      "utf-8",
    );

    expect(missingBundleForScript("inpaint.py")).toBeNull();
  });
});

describe("SCRIPT_BUNDLE_MAP drift vs dispatcher.py", () => {
  it("matches TOOL_BUNDLE_MAP in dispatcher.py exactly", () => {
    const src = readFileSync(join(process.cwd(), "packages/ai/python/dispatcher.py"), "utf-8");
    const block = src.match(/TOOL_BUNDLE_MAP\s*=\s*\{([\s\S]*?)\}/);
    if (!block) throw new Error("TOOL_BUNDLE_MAP not found in dispatcher.py");

    const pythonMap: Record<string, string> = {};
    for (const entry of block[1].matchAll(/"(\w+)"\s*:\s*"([a-z0-9-]+)"/g)) {
      pythonMap[entry[1]] = entry[2];
    }

    // Both directions: the TS mirror must equal the Python source of truth.
    expect(pythonMap).toEqual(SCRIPT_BUNDLE_MAP);
  });
});

const GIB = 1024 ** 3;

describe("per-bundle CPU memory floor (issue #1162)", () => {
  it("defines a positive CPU free-memory floor for every feature bundle and tool label for every script", () => {
    for (const bundleId of Object.keys(FEATURE_BUNDLES)) {
      const floor = BUNDLE_CPU_FREE_MEMORY_BYTES[bundleId];
      expect(floor, `missing floor for bundle ${bundleId}`).toBeGreaterThan(0);
    }
    expect(Object.keys(SCRIPT_TOOL_LABEL).sort()).toEqual(Object.keys(SCRIPT_BUNDLE_MAP).sort());
    // Light MediaPipe face detection fits a 2 GB host; heavy bundles need more.
    expect(BUNDLE_CPU_FREE_MEMORY_BYTES["face-detection"]).toBeLessThan(
      BUNDLE_CPU_FREE_MEMORY_BYTES.transcription,
    );
    expect(BUNDLE_CPU_FREE_MEMORY_BYTES["upscale-enhance"]).toBeGreaterThanOrEqual(2 * GIB);
    expect(BUNDLE_CPU_FREE_MEMORY_BYTES["inpaint-hq"]).toBeGreaterThanOrEqual(6 * GIB);
  });

  it("reads Linux MemAvailable from /proc/meminfo including 0 kB when no cgroup limit applies", () => {
    const files: Record<string, string> = {
      "/proc/meminfo": [
        "MemTotal:        4194304 kB",
        "MemFree:          524288 kB",
        "MemAvailable:    1572864 kB",
      ].join("\n"),
      "/sys/fs/cgroup/memory.max": "max\n",
    };
    const available = availableSidecarMemoryBytes({
      totalMemoryBytes: 4 * GIB,
      readTextFile: (p: string) => {
        if (p in files) return files[p];
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    });
    expect(available).toBe(1.5 * GIB);

    const exhausted = availableSidecarMemoryBytes({
      totalMemoryBytes: 8 * GIB,
      readTextFile: (p: string) => {
        if (p === "/proc/meminfo") return "MemAvailable:          0 kB\n";
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    });
    expect(exhausted).toBe(0);
  });

  it("uses cgroup v2 remaining memory while discounting reclaimable inactive_file cache", () => {
    const files: Record<string, string> = {
      "/proc/meminfo": `MemAvailable: ${12 * 1024 * 1024} kB\n`,
      "/sys/fs/cgroup/memory.max": `${6 * GIB}\n`,
      // 4.5 GiB total cgroup usage, of which 4.0 GiB is reclaimable file cache
      "/sys/fs/cgroup/memory.current": `${4.5 * GIB}\n`,
      "/sys/fs/cgroup/memory.stat": `anon ${0.5 * GIB}\ninactive_file ${4 * GIB}\n`,
    };
    const available = availableSidecarMemoryBytes({
      totalMemoryBytes: 16 * GIB,
      readTextFile: (p: string) => {
        if (p in files) return files[p];
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    });
    expect(available).toBe(5.5 * GIB);
  });

  it("falls back to cgroup v1 when v2 is absent or 'max', and ignores the v1 unlimited sentinel", () => {
    const hybridFiles: Record<string, string> = {
      "/sys/fs/cgroup/memory.max": "max\n",
      "/sys/fs/cgroup/memory/memory.limit_in_bytes": `${2 * GIB}\n`,
      "/sys/fs/cgroup/memory/memory.usage_in_bytes": `${0.8 * GIB}\n`,
      "/sys/fs/cgroup/memory/memory.stat": `inactive_file ${0.05 * GIB}\ntotal_inactive_file ${0.1 * GIB}\n`,
    };
    const available = availableSidecarMemoryBytes({
      totalMemoryBytes: 8 * GIB,
      readTextFile: (p: string) => {
        if (p in hybridFiles) return hybridFiles[p];
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    });
    expect(available).toBeCloseTo(1.3 * GIB, -3);

    // cgroup v1 unlimited sentinel falls back to totalMemoryBytes / MemAvailable
    const v1Unlimited: Record<string, string> = {
      "/sys/fs/cgroup/memory/memory.limit_in_bytes": "9223372036854771712\n",
    };
    expect(
      availableSidecarMemoryBytes({
        totalMemoryBytes: 4 * GIB,
        readTextFile: (p: string) => {
          if (p in v1Unlimited) return v1Unlimited[p];
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBe(4 * GIB);
  });

  it("handles missing cgroup usage/stat files, clamping at zero, proc contention, and fail-open", () => {
    // Missing memory.current falls back to limit
    expect(
      availableSidecarMemoryBytes({
        totalMemoryBytes: 8 * GIB,
        readTextFile: (p: string) => {
          if (p === "/sys/fs/cgroup/memory.max") return `${3 * GIB}\n`;
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBe(3 * GIB);

    // Missing memory.stat treats all usage as active; clamping prevents negative values
    expect(
      availableSidecarMemoryBytes({
        totalMemoryBytes: 8 * GIB,
        readTextFile: (p: string) => {
          if (p === "/sys/fs/cgroup/memory.max") return `${2 * GIB}\n`;
          if (p === "/sys/fs/cgroup/memory.current") return `${2.5 * GIB}\n`;
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBe(0);

    // Host MemAvailable tighter than cgroup remaining memory wins
    expect(
      availableSidecarMemoryBytes({
        totalMemoryBytes: 16 * GIB,
        readTextFile: (p: string) => {
          if (p === "/proc/meminfo") return `MemAvailable: ${Math.round(1.2 * 1024 * 1024)} kB\n`;
          if (p === "/sys/fs/cgroup/memory.max") return `${6 * GIB}\n`;
          if (p === "/sys/fs/cgroup/memory.current") return `${0.5 * GIB}\n`;
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBeCloseTo(1.2 * GIB, -3);

    // Returns null when totalMemoryBytes is non-positive and neither proc nor cgroup is readable
    expect(
      availableSidecarMemoryBytes({
        totalMemoryBytes: 0,
        readTextFile: () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBeNull();
    expect(
      sidecarMemoryRefusal("upscale.py", {
        gpuAvailable: false,
        totalMemoryBytes: 0,
        readTextFile: () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      }),
    ).toBeNull();
  });

  it("refuses all gated AI scripts on CPU when free memory is below their bundle floor", () => {
    const refusal = sidecarMemoryRefusal("upscale.py", {
      gpuAvailable: false,
      availableMemoryBytes: 1 * GIB,
    });
    expect(refusal).toContain("upscale needs about 2.5 GB free on CPU hosts, this host has 1.0 GB");

    for (const [script, expectedLabel, expectedFloor] of [
      ["remove_bg.py", "remove-background", "2.5 GB"],
      ["gif_remove_bg.py", "remove-gif-background", "2.5 GB"],
      ["detect_faces.py", "blur-faces", "0.5 GB"],
      ["face_landmarks.py", "passport-photo", "0.5 GB"],
      ["red_eye_removal.py", "red-eye-removal", "0.5 GB"],
      ["inpaint", "erase-object", "2 GB"],
      ["inpaint_hq.py", "erase-object (HQ)", "6 GB"],
      ["outpaint", "ai-canvas-expand", "2 GB"],
      ["colorize.py", "colorize", "2 GB"],
      ["upscale.py", "upscale", "2.5 GB"],
      ["enhance_faces.py", "enhance-faces", "2.5 GB"],
      ["noise_removal.py", "noise-removal", "2.5 GB"],
      ["restore.py", "restore-photo", "3 GB"],
      ["transcribe.py", "transcribe-audio", "2 GB"],
    ] as const) {
      const msg = sidecarMemoryRefusal(script, {
        gpuAvailable: false,
        availableMemoryBytes: 0.3 * GIB,
      });
      expect(msg, script).toContain(`${expectedLabel} needs about ${expectedFloor} free`);
      expect(msg, script).toContain("this host has 0.3 GB");
    }
  });

  it("allows light face-detection scripts on a 2 GB CPU host with 1.2 GiB free", () => {
    expect(
      sidecarMemoryRefusal("detect_faces.py", {
        gpuAvailable: false,
        availableMemoryBytes: 1.2 * GIB,
      }),
    ).toBeNull();
    expect(
      sidecarMemoryRefusal("detect_faces.py", {
        gpuAvailable: false,
        availableMemoryBytes: 0.3 * GIB,
      }),
    ).toContain("blur-faces needs about 0.5 GB free");
  });

  it("allows dispatch when CPU free memory meets the floor or when a GPU is available", () => {
    expect(
      sidecarMemoryRefusal("upscale.py", {
        gpuAvailable: false,
        availableMemoryBytes: 2.5 * GIB,
      }),
    ).toBeNull();
    expect(
      sidecarMemoryRefusal("upscale.py", {
        gpuAvailable: true,
        availableMemoryBytes: 1.0 * GIB,
      }),
    ).toBeNull();
    expect(
      sidecarMemoryRefusal("doc_text.py", {
        gpuAvailable: false,
        availableMemoryBytes: 0.2 * GIB,
      }),
    ).toBeNull();
  });

  it("distinguishes the AI memory floor from the 2 GB non-AI base floor in published docs", () => {
    const deployment = readFileSync(join(process.cwd(), "apps/docs/guide/deployment.md"), "utf-8");
    const lowResource = readFileSync(
      join(process.cwd(), "apps/docs/guide/low-resource.md"),
      "utf-8",
    );
    const aiDocs = readFileSync(join(process.cwd(), "apps/docs/api/ai.md"), "utf-8");

    expect(deployment).toMatch(/\| Bundle \| Disk Size \| CPU Memory Floor \|/);
    expect(lowResource).toContain("2 GB of host RAM (0.5 GB free)");
    expect(aiDocs).toMatch(/\| Bundle \| Size \| CPU memory floor \|/i);
  });
});
