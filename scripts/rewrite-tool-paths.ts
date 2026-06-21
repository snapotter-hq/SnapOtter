// Usage (macOS/BSD; tsx is hoisted under apps/api, not the workspace root):
//   git ls-files <globs> | xargs apps/api/node_modules/.bin/tsx scripts/rewrite-tool-paths.ts
import { readFileSync, writeFileSync } from "node:fs";
import { TOOLS, toolSection } from "@snapotter/shared";
import { rewriteToolPaths } from "./lib/rewrite-tool-paths.js";

const idToSection = Object.fromEntries(TOOLS.map((t) => [t.id, toolSection(t)]));
const files = process.argv.slice(2);
let changed = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = rewriteToolPaths(before, idToSection);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log(`rewrote ${file}`);
  }
}
console.log(`done: ${changed}/${files.length} files changed`);
