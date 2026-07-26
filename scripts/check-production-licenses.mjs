#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "config/production-license-policy.json");
const noticesPath = path.join(root, "THIRD_PARTY_NOTICES.md");

function packageLabels(entries) {
  return entries
    .flatMap((entry) => {
      const versions = Array.isArray(entry.versions)
        ? [...entry.versions].map(String).sort().join(",")
        : "unknown";
      return `${String(entry.name ?? "unnamed")}@${versions}`;
    })
    .sort();
}

export function validateInventory(inventory, policy) {
  const allowed = new Set(policy.allowedExpressions ?? []);
  const denied = new Set(policy.deniedExpressions ?? []);
  const violations = [];

  for (const expression of Object.keys(inventory).sort()) {
    const entries = Array.isArray(inventory[expression]) ? inventory[expression] : [];
    const packages = packageLabels(entries).join(", ");
    const declaredLicenses = new Set(entries.map((entry) => entry.license));
    if (declaredLicenses.size !== 1 || !declaredLicenses.has(expression)) {
      violations.push(`inventory group ${expression} has inconsistent package license metadata`);
    }
    if (/^(unknown|unlicensed)$/i.test(expression)) {
      violations.push(`unknown license expression ${expression}: ${packages}`);
    } else if (denied.has(expression)) {
      violations.push(`denied license expression ${expression}: ${packages}`);
    } else if (!allowed.has(expression)) {
      violations.push(`unapproved license expression ${expression}: ${packages}`);
    }
  }

  for (const expression of denied) {
    if (allowed.has(expression)) {
      violations.push(`policy expression is both allowed and denied: ${expression}`);
    }
  }
  return violations.sort();
}

// Native bindings ship one package per platform and arch, so `pnpm licenses
// list` returns whichever set the current machine installed. Rendering those
// verbatim makes the notices file describe the developer's laptop: it is
// regenerated on macOS, then the Linux CI runner resolves the x64 bindings
// instead and fails the very check that produced it.
//
// Collapse each family to its base name for the notices. The policy check above
// still sees every package the current platform installed, so an unacceptable
// license in a binding is caught wherever it is installed; only the attribution
// list is normalized, and the upstream project is still credited once.
// Three shapes in the wild: a suffix on the package name
// (@img/sharp-darwin-arm64), the libc glued to the OS (@img/sharp-linuxmusl-arm64),
// and the whole unscoped name (@esbuild/darwin-arm64), which collapses to the
// scope alone.
const PLATFORM_SUFFIX =
  /[-/](?:darwin|linux(?:musl)?|win32|freebsd|openbsd|android|sunos)(?:-(?:x64|arm64|arm|ia32|ppc64|s390x|riscv64|loong64))?(?:-(?:musl|gnu|gnueabihf|msvc))?$/;

// Packages that only exist on one platform, rather than shipping a build per
// platform. fsevents is macOS-only by design and simply absent on Linux, so it
// cannot be normalized into a shared family and has to be named.
const PLATFORM_ONLY_PACKAGES = new Set(["fsevents"]);

function platformFamily(name) {
  return String(name).replace(PLATFORM_SUFFIX, "");
}

export function renderNotices(inventory) {
  const lines = [
    "# Third-Party Production Node Dependency Notices",
    "",
    "This file is generated from the frozen pnpm production dependency graph.",
    "This inventory covers Node packages only; exact release artifacts publish separate full SBOMs.",
    "Run `pnpm check:production-node-licenses -- --write-notices` after an intentional dependency change.",
    "Package authors retain all rights granted by their respective licenses.",
    "",
  ];

  for (const expression of Object.keys(inventory).sort()) {
    lines.push(`## ${expression}`, "");
    const families = new Map();
    for (const entry of inventory[expression]) {
      if (PLATFORM_ONLY_PACKAGES.has(entry.name)) continue;
      const name = platformFamily(entry.name);
      const family = families.get(name) ?? { name, versions: new Set(), homepage: entry.homepage };
      for (const version of entry.versions) family.versions.add(String(version));
      family.homepage ??= entry.homepage;
      families.set(name, family);
    }
    const entries = [...families.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const versions = [...entry.versions].sort().join(",");
      const label = `${entry.name}@${versions}`;
      lines.push(entry.homepage ? `- [${label}](${entry.homepage})` : `- ${label}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function readPolicy() {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (
    policy.schemaVersion !== 1 ||
    !Array.isArray(policy.allowedExpressions) ||
    !Array.isArray(policy.deniedExpressions)
  ) {
    throw new Error("production license policy has an unsupported schema");
  }
  return policy;
}

function readInventory() {
  return JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
}

function main() {
  const policy = readPolicy();
  const inventory = readInventory();
  const violations = validateInventory(inventory, policy);
  if (violations.length > 0) {
    for (const violation of violations) console.error(`ERROR: ${violation}`);
    process.exitCode = 1;
    return;
  }

  const expectedNotices = renderNotices(inventory);
  if (process.argv.includes("--write-notices")) {
    writeFileSync(noticesPath, expectedNotices);
    console.log(`Updated ${path.relative(root, noticesPath)}`);
    return;
  }

  if (!existsSync(noticesPath) || readFileSync(noticesPath, "utf8") !== expectedNotices) {
    console.error(
      "ERROR: THIRD_PARTY_NOTICES.md is stale; review the dependency change, then run pnpm check:production-node-licenses -- --write-notices",
    );
    process.exitCode = 1;
    return;
  }
  const packageCount = Object.values(inventory).reduce((sum, entries) => sum + entries.length, 0);
  console.log(
    `Production Node license policy passed: ${packageCount} packages across ${Object.keys(inventory).length} expressions`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
