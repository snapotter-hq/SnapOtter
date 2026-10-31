#!/usr/bin/env node
// PostToolUse hook for Claude Code: run Biome on the file that was just edited.
// Never blocks. Anything Biome cannot fix goes back to the agent as context.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractExplicitFilePaths, readInput } = require("./input.cjs");
const { protectedPath } = require("./protect-config.cjs");

const BIOME_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc"]);
const MAX_CONTEXT_CHARS = 2000;

function findBiome(startDir) {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", ".bin", "biome");
    if (fs.existsSync(candidate)) {
      return { bin: candidate, root: dir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function shouldSkip(filePath) {
  if (!BIOME_EXTENSIONS.has(path.extname(filePath))) return true;
  if (filePath.split(path.sep).includes("node_modules")) return true;
  // protect-config.cjs owns these; Biome must never rewrite its own policy files.
  if (protectedPath([filePath])) return true;
  return !fs.existsSync(filePath);
}

function biomeFeedback(filePath) {
  const biome = findBiome(path.dirname(filePath));
  if (!biome) return "";

  const result = spawnSync(
    biome.bin,
    ["check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true", filePath],
    { cwd: biome.root, encoding: "utf8", timeout: 20000 },
  );
  if (result.error || result.status === 0) return "";

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (!output) return "";
  const clipped =
    output.length > MAX_CONTEXT_CHARS ? `${output.slice(0, MAX_CONTEXT_CHARS)}\n...` : output;
  return `Biome could not auto-fix ${path.relative(biome.root, filePath)}. Fix these by hand:\n${clipped}`;
}

if (require.main === module) {
  const input = readInput();
  const messages = extractExplicitFilePaths(input)
    .map((filePath) => path.resolve(input.cwd || process.cwd(), filePath))
    .filter((filePath) => !shouldSkip(filePath))
    .map(biomeFeedback)
    .filter(Boolean);

  if (messages.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: messages.join("\n\n"),
        },
      }),
    );
  }
}

module.exports = { biomeFeedback, shouldSkip };
