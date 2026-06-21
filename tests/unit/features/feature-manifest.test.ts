import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = join(import.meta.dirname, "../../../docker/feature-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const bundles = manifest.bundles;

function getAllPackages(bundleId: string): string[] {
  const bundle = bundles[bundleId];
  const common = bundle.packages.common ?? [];
  const amd64 = bundle.packages.amd64 ?? [];
  const arm64 = bundle.packages.arm64 ?? [];
  return [...common, ...amd64, ...arm64].map((p: string) => p.split(/[=<>!\s[]/)[0].toLowerCase());
}

function getBasePackages(): string[] {
  return (manifest.basePackages ?? []).map((p: string) => p.split(/[=<>!\s[]/)[0].toLowerCase());
}

function bundleIncludesPackage(bundleId: string, pkg: string): boolean {
  const all = [...getAllPackages(bundleId), ...getBasePackages()];
  return all.some((p) => p === pkg.toLowerCase());
}

function archPackagesInclude(bundleId: string, arch: "amd64" | "arm64", pkg: string): boolean {
  const archPkgs = (bundles[bundleId].packages[arch] ?? []).map((p: string) =>
    p.split(/[=<>!\s[]/)[0].toLowerCase(),
  );
  return archPkgs.some((p: string) => p === pkg.toLowerCase());
}

describe("Feature manifest structure", () => {
  it("manifest has valid version fields", () => {
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.pythonVersion).toBeDefined();
    expect(manifest.basePackages).toBeInstanceOf(Array);
  });

  it("all 7 bundles are defined", () => {
    expect(Object.keys(bundles)).toHaveLength(7);
    expect(bundles["background-removal"]).toBeDefined();
    expect(bundles["face-detection"]).toBeDefined();
    expect(bundles["object-eraser-colorize"]).toBeDefined();
    expect(bundles["upscale-enhance"]).toBeDefined();
    expect(bundles["photo-restoration"]).toBeDefined();
    expect(bundles.ocr).toBeDefined();
    expect(bundles.transcription).toBeDefined();
  });

  it("every bundle has required fields", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      expect(bundle.name, `${id} missing name`).toBeDefined();
      expect(bundle.description, `${id} missing description`).toBeDefined();
      expect(bundle.packages, `${id} missing packages`).toBeDefined();
      expect(bundle.enablesTools, `${id} missing enablesTools`).toBeDefined();

      const pkgs = bundle.packages as Record<string, unknown>;
      expect(pkgs.common, `${id} missing packages.common`).toBeInstanceOf(Array);
      expect(pkgs.amd64, `${id} missing packages.amd64`).toBeInstanceOf(Array);
      expect(pkgs.arm64, `${id} missing packages.arm64`).toBeInstanceOf(Array);
    }
  });

  it("every bundle has at least one enabled tool", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const tools = bundle.enablesTools as string[];
      expect(tools.length, `${id} has no enabled tools`).toBeGreaterThan(0);
    }
  });
});

describe("Feature manifest: mediapipe dependency (regression for #129)", () => {
  it("upscale-enhance bundle includes mediapipe for amd64", () => {
    expect(archPackagesInclude("upscale-enhance", "amd64", "mediapipe")).toBe(true);
  });

  it("upscale-enhance bundle includes mediapipe for arm64", () => {
    expect(archPackagesInclude("upscale-enhance", "arm64", "mediapipe")).toBe(true);
  });
});

describe("Feature manifest: bundle dependency completeness", () => {
  const TOOL_REQUIRED_PACKAGES: Record<string, { bundle: string; requires: string[] }> = {
    "enhance-faces": {
      bundle: "upscale-enhance",
      requires: ["mediapipe", "codeformer-pip", "realesrgan"],
    },
    "blur-faces": {
      bundle: "face-detection",
      requires: ["mediapipe"],
    },
    "red-eye-removal": {
      bundle: "face-detection",
      requires: ["mediapipe"],
    },
    "remove-background": {
      bundle: "background-removal",
      requires: ["rembg"],
    },
    "erase-object": {
      bundle: "object-eraser-colorize",
      requires: ["huggingface-hub"],
    },
    upscale: {
      bundle: "upscale-enhance",
      requires: ["realesrgan"],
    },
    "noise-removal": {
      bundle: "upscale-enhance",
      requires: ["einops"],
    },
    "restore-photo": {
      bundle: "photo-restoration",
      requires: ["mediapipe", "codeformer-pip", "realesrgan"],
    },
    ocr: {
      bundle: "ocr",
      requires: ["paddleocr"],
    },
    colorize: {
      bundle: "object-eraser-colorize",
      requires: ["huggingface-hub"],
    },
  };

  for (const [toolId, { bundle, requires }] of Object.entries(TOOL_REQUIRED_PACKAGES)) {
    for (const pkg of requires) {
      it(`${bundle} bundle includes ${pkg} (needed by ${toolId})`, () => {
        expect(
          bundleIncludesPackage(bundle, pkg),
          `Bundle "${bundle}" is missing "${pkg}" which is required by tool "${toolId}". ` +
            `This will cause an ImportError at runtime when "${toolId}" is used.`,
        ).toBe(true);
      });
    }
  }
});

describe("Feature manifest: mediapipe version consistency", () => {
  const MEDIAPIPE_BUNDLES = [
    "face-detection",
    "background-removal",
    "upscale-enhance",
    "photo-restoration",
  ];

  it("all bundles use the same mediapipe version for amd64", () => {
    const versions: string[] = [];
    for (const bundleId of MEDIAPIPE_BUNDLES) {
      const amd64Pkgs = bundles[bundleId].packages.amd64 as string[];
      const mp = amd64Pkgs.find((p: string) => p.startsWith("mediapipe"));
      if (mp) versions.push(mp);
    }
    expect(versions.length).toBeGreaterThan(0);
    expect(
      new Set(versions).size,
      `Inconsistent mediapipe versions on amd64: ${versions.join(", ")}`,
    ).toBe(1);
  });

  it("all bundles use the same mediapipe version for arm64", () => {
    const versions: string[] = [];
    for (const bundleId of MEDIAPIPE_BUNDLES) {
      const arm64Pkgs = bundles[bundleId].packages.arm64 as string[];
      const mp = arm64Pkgs.find((p: string) => p.startsWith("mediapipe"));
      if (mp) versions.push(mp);
    }
    expect(versions.length).toBeGreaterThan(0);
    expect(
      new Set(versions).size,
      `Inconsistent mediapipe versions on arm64: ${versions.join(", ")}`,
    ).toBe(1);
  });
});

describe("Feature manifest: architecture parity", () => {
  it("every bundle with amd64 packages has arm64 packages", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const pkgs = bundle.packages as Record<string, string[]>;
      if (pkgs.amd64.length > 0) {
        expect(pkgs.arm64.length, `${id} has amd64 packages but no arm64 packages`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("mediapipe is present on both architectures when present on either", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const pkgs = bundle.packages as Record<string, string[]>;
      const hasAmd64 = pkgs.amd64.some((p: string) => p.startsWith("mediapipe"));
      const hasArm64 = pkgs.arm64.some((p: string) => p.startsWith("mediapipe"));
      if (hasAmd64 || hasArm64) {
        expect(hasAmd64, `${id}: mediapipe in arm64 but missing from amd64`).toBe(true);
        expect(hasArm64, `${id}: mediapipe in amd64 but missing from arm64`).toBe(true);
      }
    }
  });
});

describe("Feature manifest: enablesTools consistency with shared features", () => {
  it("manifest enablesTools matches features.ts for each bundle", async () => {
    const { FEATURE_BUNDLES } = await import("@snapotter/shared");
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const manifestTools = (bundle.enablesTools as string[]).sort();
      const sharedTools = FEATURE_BUNDLES[id].enablesTools.sort();
      expect(manifestTools, `${id}: manifest enablesTools diverges from features.ts`).toEqual(
        sharedTools,
      );
    }
  });
});

describe("Manifest v2 archive fields", () => {
  const ARCH_VARIANTS = ["amd64-gpu", "arm64-cpu"] as const;

  it("manifest version is 2", () => {
    expect(manifest.manifestVersion).toBe(2);
  });

  it("has bundleRepo field", () => {
    // Bundles are currently published to deepsafe/feature-bundles; the canonical
    // snapotter/feature-bundles repo is restored later (see .github/workflows/ai-bundles.yml).
    expect(manifest.bundleRepo).toBe("deepsafe/feature-bundles");
  });

  it("every bundle has archives with both arch variants", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const archives = bundle.archives as Record<string, unknown>;
      expect(archives, `${id} missing archives`).toBeDefined();
      for (const arch of ARCH_VARIANTS) {
        expect(archives[arch], `${id} missing archives["${arch}"]`).toBeDefined();
      }
    }
  });

  it("each archive entry has file, sha256, compressedSize, extractedSize", () => {
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const archives = bundle.archives as Record<string, Record<string, unknown>>;
      for (const arch of ARCH_VARIANTS) {
        const entry = archives[arch];
        expect(typeof entry.file, `${id}/${arch} file should be string`).toBe("string");
        expect(entry.file as string, `${id}/${arch} file should end with .tar.gz`).toMatch(
          /\.tar\.gz$/,
        );
        expect(typeof entry.sha256, `${id}/${arch} sha256 should be string`).toBe("string");
        expect(entry.sha256 as string, `${id}/${arch} sha256 should be 64 hex chars`).toMatch(
          /^[0-9a-f]{64}$/,
        );
        expect(typeof entry.compressedSize, `${id}/${arch} compressedSize should be number`).toBe(
          "number",
        );
        expect(
          entry.compressedSize as number,
          `${id}/${arch} compressedSize should be > 0`,
        ).toBeGreaterThan(0);
        expect(typeof entry.extractedSize, `${id}/${arch} extractedSize should be number`).toBe(
          "number",
        );
        // extractedSize (uncompressed size) is a best-effort, informational field feeding
        // only a conservative disk-space pre-check (install_feature.py). The build script
        // does not always measure it, so 0 ("not yet measured") is valid. The sha256 and
        // compressedSize fields above are integrity-critical and remain strictly validated.
        expect(
          entry.extractedSize as number,
          `${id}/${arch} extractedSize should be >= 0`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("archive file paths include version prefix", () => {
    const version = manifest.imageVersion;
    for (const [id, bundle] of Object.entries<Record<string, unknown>>(bundles)) {
      const archives = bundle.archives as Record<string, Record<string, unknown>>;
      for (const arch of ARCH_VARIANTS) {
        expect(
          archives[arch].file as string,
          `${id}/${arch} file should include v${version}/`,
        ).toContain(`v${version}/`);
      }
    }
  });
});
