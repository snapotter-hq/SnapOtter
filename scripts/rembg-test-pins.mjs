#!/usr/bin/env node
// Pins for ci.yml's "AI Sidecar (rembg)" job (#1299). Two sets reach users:
// the background-removal bundle built from docker/feature-manifest.json, and
// the sidecar requirements in packages/ai/python/requirements.txt. The job
// runs tests/unit/ai/remove-bg-hr-matting.test.ts against each, so a rembg
// bump in either one is tested before it ships.
//
//   node scripts/rembg-test-pins.mjs <bundle|requirements> <out-dir>
//
// writes <out-dir>/pins.txt and <out-dir>/constraints.txt for pip.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// What the HR matting session imports, directly or through rembg's __init__.
const IMPORTED = ["rembg", "onnxruntime", "numpy", "Pillow", "opencv-python-headless"];
const nameOf = (pin) =>
  pin
    .split(/[=<>![]/)[0]
    .trim()
    .toLowerCase();

function pick(pins, label) {
  const picked = IMPORTED.map((name) => {
    const found = pins.filter((pin) => nameOf(pin) === name.toLowerCase());
    if (found.length !== 1) {
      throw new Error(`${label}: expected one ${name} pin, found ${found.length}`);
    }
    return found[0];
  });
  return picked;
}

/**
 * Both sets install under the bundle's transitive constraints (scipy,
 * scikit-image and the rest), which requirements.txt doesn't pin, so neither
 * floats onto a release production never runs.
 *
 * @param {"bundle" | "requirements"} source
 */
export function rembgTestPins(source) {
  const manifest = JSON.parse(readFileSync(join(root, "docker/feature-manifest.json"), "utf8"));
  if (source === "bundle") {
    const bundle = manifest.bundles["background-removal"];
    if (!bundle) throw new Error("docker/feature-manifest.json has no background-removal bundle");
    // The CPU build (arm64-cpu), which is what a CI runner can run.
    const pins = [...manifest.basePackages, ...bundle.packages.common, ...bundle.packages.arm64];
    return { pins: pick(pins, "docker/feature-manifest.json"), constraints: manifest.constraints };
  }
  if (source === "requirements") {
    const lines = readFileSync(join(root, "packages/ai/python/requirements.txt"), "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean);
    return {
      pins: pick(lines, "packages/ai/python/requirements.txt"),
      constraints: manifest.constraints,
    };
  }
  throw new Error(`unknown pin source "${source}" (expected bundle or requirements)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, outDir] = process.argv.slice(2);
  if (!source || !outDir) {
    console.error("usage: node scripts/rembg-test-pins.mjs <bundle|requirements> <out-dir>");
    process.exit(2);
  }
  const { pins, constraints } = rembgTestPins(source);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "pins.txt"), `${pins.join("\n")}\n`);
  writeFileSync(join(outDir, "constraints.txt"), `${constraints.join("\n")}\n`);
  console.log(`${source}: ${pins.join(" ")}`);
}
