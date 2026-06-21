#!/usr/bin/env node
// Stamps sha256 + bytes for real fixture assets into manifest.json.
// Provenance (sourceUrl/license) is filled by hand -- this only fills hashes.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const existing = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const byPath = new Map(existing.assets.map((a) => [a.path, a]));

// Scan each modality valid dir (replaces the old content/ scan)
const SCAN_DIRS = [
  "image/valid",
  "video/valid",
  "audio/valid",
  "document/valid",
];

for (const dir of SCAN_DIRS) {
  const absDir = join(ROOT, dir);
  if (!existsSync(absDir)) continue;
  for (const name of readdirSync(absDir)) {
    const rel = `${dir}/${name}`;
    const bytes = readFileSync(join(absDir, name));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const prev = byPath.get(rel) ?? { path: rel, sourceUrl: "UNVERIFIED", license: "UNVERIFIED", toolsServed: [] };
    byPath.set(rel, { ...prev, sha256, bytes: bytes.length });
  }
}
const assets = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(ROOT, "manifest.json"), JSON.stringify({ assets }, null, 2));
console.log(`manifest: ${assets.length} assets`);
