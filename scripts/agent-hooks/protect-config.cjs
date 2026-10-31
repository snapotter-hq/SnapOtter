#!/usr/bin/env node
// Shared config protection for Claude Code and Codex.
// Biome, TypeScript, and editor config files are policy, not suggestions, so a
// change to one asks the owner first.

const {
  extractExplicitFilePaths,
  extractFilePaths,
  readInput,
  reportVerdict,
  splitSegments,
  tokenize,
  verdict,
} = require("./input.cjs");
const { isSecretPath } = require("./env-secret-guard.cjs");

const protectedPatterns = [
  /(^|\/)biome\.json$/,
  /(^|\/)\.eslintrc/,
  /(^|\/)eslint\.config/,
  /(^|\/)\.prettierrc/,
  /(^|\/)prettier\.config/,
  /(^|\/)tsconfig.*\.json$/,
  /(^|\/)\.editorconfig$/,
];

// Commands that write to the files they name. Reads (cat, git diff, grep) are fine.
const FILE_WRITERS = new Set(["tee", "mv", "cp", "rm", "truncate", "install", "ln", "chmod"]);

function protectedPath(paths) {
  return paths.find((filePath) => protectedPatterns.some((pattern) => pattern.test(filePath)));
}

function isInPlaceEdit(tokens) {
  const editor = tokens.includes("sed") || tokens.includes("perl");
  return editor && tokens.some((t) => /^-[a-zA-Z]*i/.test(t));
}

// cp and ln only write their last argument. The source is read, not changed.
const DESTINATION_ONLY = new Set(["cp", "ln"]);

// Files a shell segment writes: redirection targets, `dd of=`, and the
// arguments a writer command changes.
function writeTargets(tokens) {
  const targets = [];
  tokens.forEach((token, i) => {
    if (token.includes(">")) targets.push(token.replace(/^.*>+/, "") || tokens[i + 1]);
    if (token.startsWith("of=")) targets.push(token.slice(3));
  });
  const writerAt = tokens.findIndex((t) => FILE_WRITERS.has(t));
  if (writerAt !== -1) {
    const args = tokens.slice(writerAt + 1).filter((t) => !t.startsWith("-"));
    targets.push(...(DESTINATION_ONLY.has(tokens[writerAt]) ? args.slice(-1) : args));
  } else if (isInPlaceEdit(tokens)) {
    targets.push(...tokens.filter((t) => !t.startsWith("-")));
  }
  return targets.filter(Boolean);
}

// Edit and Write are covered by the file-path matcher. This catches the same
// edits made from the shell, such as `sed -i` or `echo {} > tsconfig.json`.
function protectedCommandVerdict(command) {
  for (const segment of splitSegments(command)) {
    const blocked = protectedPath(writeTargets(tokenize(segment.trim())));
    if (blocked) {
      return verdict(
        "ask",
        `shell write to config file "${blocked}". The lint and type config is policy. Fix the code to match it, or approve this change.`,
      );
    }
  }
  return null;
}

if (require.main === module) {
  const input = readInput();
  const explicit = extractExplicitFilePaths(input);
  const paths = explicit.length > 0 ? explicit : extractFilePaths(input);
  const blocked = protectedPath(paths);
  const secret = paths.find(isSecretPath);
  if (blocked) {
    process.exitCode = reportVerdict(
      verdict(
        "ask",
        `edit to config file "${blocked}". The lint and type config is policy. Approve only if the change is intended.`,
      ),
    );
  } else if (secret) {
    process.exitCode = reportVerdict(
      verdict("ask", `writing a secrets file "${secret}". Confirm it stays out of git.`),
    );
  }
}

module.exports = { protectedCommandVerdict, protectedPath, writeTargets };
