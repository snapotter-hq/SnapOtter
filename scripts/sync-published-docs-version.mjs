#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

export function updateReleaseReferences(source, version) {
  return source
    .replace(/(SnapOtter\/(?:blob\/)?v)[^/]+(\/docker\/docker-compose\.yml)/g, `$1${version}$2`)
    .replace(
      /(snapotter-v)[0-9][0-9A-Za-z.+-]*?(?=-(?:release-subjects|image-linux-amd64-sbom))/g,
      `$1${version}`,
    )
    .replace(/(snapotter\/snapotter:)[0-9][0-9A-Za-z.+-]*/g, `$1${version}`);
}

function releasePages(root) {
  const docsRoot = path.join(root, "apps/docs");
  const pages = [
    path.join(docsRoot, "guide/getting-started.md"),
    path.join(docsRoot, "guide/security.md"),
  ];
  if (!existsSync(docsRoot)) return pages;
  for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "guide") continue;
    pages.push(
      path.join(docsRoot, entry.name, "guide/getting-started.md"),
      path.join(docsRoot, entry.name, "guide/security.md"),
    );
  }
  return pages.filter(existsSync);
}

export function syncPublishedDocsVersion(root, version) {
  if (!SEMVER.test(version)) throw new Error(`Invalid semantic version: ${version}`);
  let updated = 0;
  for (const page of releasePages(root)) {
    const source = readFileSync(page, "utf8");
    const next = updateReleaseReferences(source, version);
    if (next !== source) {
      writeFileSync(page, next);
      updated++;
    }
  }
  return updated;
}

function main() {
  const version = process.argv[2];
  const rootFlag = process.argv.indexOf("--root");
  const root =
    rootFlag === -1
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
      : path.resolve(process.argv[rootFlag + 1] ?? "");
  if (!version) throw new Error("Usage: sync-published-docs-version.mjs <version> [--root path]");
  const updated = syncPublishedDocsVersion(root, version);
  console.log(`Updated ${updated} published documentation version file(s) -> ${version}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main();
