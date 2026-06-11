#!/usr/bin/env node
/**
 * Export an installed AI feature bundle as a gzipped tar archive for offline
 * transfer to air-gapped SnapOtter installations.
 *
 * Usage:
 *   node scripts/export-ai-bundle.mjs <bundleId> [--data-dir /data] [outFile]
 *
 * The archive contains:
 *   bundle.json          - { bundleId, version, models }
 *   models/<...>         - model files mirroring MODELS_DIR layout
 *
 * Defaults:
 *   --data-dir  /data
 *   outFile     <bundleId>-<version>.tar.gz (in cwd)
 *
 * Requires the `tar` npm package from apps/api/node_modules (resolved via
 * createRequire, same pattern as tests/global-setup.ts).
 */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRequire = createRequire(join(__dirname, "../apps/api/package.json"));
const tar = apiRequire("tar");

// ── CLI argument parsing ───────────────────────────────────────────────

function usage() {
  process.stderr.write(
    "Usage: node scripts/export-ai-bundle.mjs <bundleId> [--data-dir /data] [outFile]\n",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  usage();
}

let bundleId = null;
let dataDir = "/data";
let outFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--data-dir") {
    i++;
    if (!args[i]) {
      process.stderr.write("Error: --data-dir requires a value\n");
      process.exit(1);
    }
    dataDir = args[i];
  } else if (!bundleId) {
    bundleId = args[i];
  } else if (!outFile) {
    outFile = args[i];
  } else {
    process.stderr.write(`Error: unexpected argument "${args[i]}"\n`);
    usage();
  }
}

if (!bundleId) {
  process.stderr.write("Error: bundleId is required\n");
  usage();
}

// ── Resolve paths ──────────────────────────────────────────────────────

const aiDir = join(dataDir, "ai");
const installedPath = join(aiDir, "installed.json");
const modelsDir = join(aiDir, "models");

if (!existsSync(installedPath)) {
  process.stderr.write(`Error: ${installedPath} not found. No bundles are installed.\n`);
  process.exit(1);
}

let installedData;
try {
  installedData = JSON.parse(readFileSync(installedPath, "utf-8"));
} catch (err) {
  process.stderr.write(`Error: cannot parse ${installedPath}: ${err.message}\n`);
  process.exit(1);
}

const bundleInfo = installedData.bundles?.[bundleId];
if (!bundleInfo) {
  const available = Object.keys(installedData.bundles || {});
  process.stderr.write(`Error: bundle "${bundleId}" is not installed.\n`);
  if (available.length > 0) {
    process.stderr.write(`Installed bundles: ${available.join(", ")}\n`);
  } else {
    process.stderr.write("No bundles are currently installed.\n");
  }
  process.exit(1);
}

const version = bundleInfo.version;
const models = bundleInfo.models || [];

if (!outFile) {
  outFile = `${bundleId}-${version}.tar.gz`;
}

// ── Build staging area with bundle.json ────────────────────────────────

const stagingDir = join(tmpdir(), `snapotter-export-${randomUUID()}`);
mkdirSync(stagingDir, { recursive: true });

const bundleDescriptor = {
  bundleId,
  version,
  models,
};

writeFileSync(join(stagingDir, "bundle.json"), JSON.stringify(bundleDescriptor, null, 2), "utf-8");

// ── Collect model file paths ───────────────────────────────────────────

const modelEntries = [];
for (const modelPath of models) {
  const fullPath = join(modelsDir, modelPath);
  if (!existsSync(fullPath)) {
    process.stderr.write(`Warning: model file not found, skipping: ${modelPath}\n`);
    continue;
  }
  modelEntries.push(modelPath);
}

if (modelEntries.length === 0) {
  process.stderr.write("Warning: no model files found; archive will only contain bundle.json\n");
}

process.stderr.write(`Exporting bundle "${bundleId}" v${version} (${modelEntries.length} model files)...\n`);

// ── Create the archive ─────────────────────────────────────────────────

const outPath = resolve(outFile);

// We create the tar in two phases: bundle.json from staging, models from modelsDir.
// tar.create needs a single cwd, so we use a two-step approach with the staging dir.
// First, symlink models dir into staging so everything is under one root.
import { symlinkSync } from "node:fs";

const stagingModelsLink = join(stagingDir, "models");
try {
  symlinkSync(modelsDir, stagingModelsLink);
} catch (err) {
  process.stderr.write(`Error: cannot create symlink for models: ${err.message}\n`);
  rmSync(stagingDir, { recursive: true, force: true });
  process.exit(1);
}

const fileList = ["bundle.json", ...modelEntries.map((m) => `models/${m}`)];

try {
  await tar.create(
    {
      gzip: true,
      file: outPath,
      cwd: stagingDir,
    },
    fileList,
  );
} catch (err) {
  process.stderr.write(`Error: failed to create archive: ${err.message}\n`);
  rmSync(stagingDir, { recursive: true, force: true });
  process.exit(1);
}

// ── Cleanup ────────────────────────────────────────────────────────────

rmSync(stagingDir, { recursive: true, force: true });

process.stderr.write(`Created ${outPath}\n`);
process.exit(0);
