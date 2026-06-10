#!/usr/bin/env node
// Enforces D15: core never reaches into packages/enterprise internals,
// and packages/enterprise never imports from apps/* (it must stay standalone).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".turbo", "coverage"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      yield full;
    }
  }
}

const ENTERPRISE_DIR = join(ROOT, "packages/enterprise");
// Catches static `from "..."`, side-effect `import "..."`, and dynamic `import("...")`
// forms. The bare package entry "@snapotter/enterprise" (no trailing slash) stays
// allowed; only reaching INTO the package is a violation.
const INTERNAL_IMPORT = /(from|import)\s*[\s(]\s*["'](@snapotter\/enterprise\/|[./]*packages\/enterprise\/)/;
const APP_IMPORT = /(from|import)\s*[\s(]\s*["'][^"']*apps\/(api|web)\//;

const violations = [];

for (const root of [join(ROOT, "apps"), join(ROOT, "packages")]) {
  for (const file of walk(root)) {
    const insideEnterprise = file.startsWith(ENTERPRISE_DIR);
    const text = readFileSync(file, "utf8");
    for (const [lineNo, line] of text.split("\n").entries()) {
      if (!insideEnterprise && INTERNAL_IMPORT.test(line)) {
        violations.push(`core imports enterprise internals: ${relative(ROOT, file)}:${lineNo + 1}`);
      }
      if (insideEnterprise && APP_IMPORT.test(line)) {
        violations.push(`enterprise imports app code: ${relative(ROOT, file)}:${lineNo + 1}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("License boundary violations (D15):");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("License boundary check passed.");
