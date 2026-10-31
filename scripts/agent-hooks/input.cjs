// Shared hook input parsing for Claude Code and Codex.
// Both harnesses send JSON on stdin, but the field names differ.

const fs = require("node:fs");

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return current[key];
    }
    return undefined;
  }, value);
}

function firstString(value, paths) {
  for (const path of paths) {
    const candidate = getPath(value, path);
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return "";
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }
  return output;
}

function extractCommand(input) {
  return firstString(input, [
    "tool_input.command",
    "tool_input.cmd",
    "toolInput.command",
    "input.command",
    "arguments.command",
    "params.command",
    "command",
    "cmd",
  ]);
}

function normalizePath(filePath) {
  return filePath
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^a\//, "")
    .replace(/^b\//, "");
}

function extractPatchPaths(text) {
  const paths = [];
  const patterns = [
    /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm,
    /^(?:---|\+\+\+) (?:a\/|b\/)?(.+)$/gm,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const filePath = normalizePath(match[1]);
      if (filePath && filePath !== "/dev/null") {
        paths.push(filePath);
      }
    }
  }

  return paths;
}

function extractExplicitFilePaths(input) {
  const explicitPaths = [
    "tool_input.file_path",
    "tool_input.filePath",
    "tool_input.path",
    "toolInput.file_path",
    "toolInput.filePath",
    "toolInput.path",
    "input.file_path",
    "input.filePath",
    "input.path",
    "arguments.file_path",
    "arguments.filePath",
    "arguments.path",
    "params.file_path",
    "params.filePath",
    "params.path",
    "file_path",
    "filePath",
    "path",
  ];

  const paths = [];
  for (const path of explicitPaths) {
    const candidate = getPath(input, path);
    if (typeof candidate === "string" && candidate.trim()) {
      paths.push(normalizePath(candidate));
    }
  }
  return [...new Set(paths.filter(Boolean))];
}

function extractFilePaths(input) {
  const paths = extractExplicitFilePaths(input);

  for (const text of collectStrings(input)) {
    paths.push(...extractPatchPaths(text));
  }

  return [...new Set(paths.filter(Boolean))];
}

// Splits a shell command into the segments that run as separate commands.
function splitSegments(command) {
  return String(command || "").split(/&&|\|\||[;|\n]/);
}

function tokenize(segment) {
  const matches = segment.match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
  return matches.map((token) => token.replace(/^["']|["']$/g, ""));
}

// The git subcommand, skipping global options such as `-C <dir>` and `-c <cfg>`.
function gitSubcommand(tokens) {
  const gitAt = tokens.indexOf("git");
  if (gitAt === -1) return null;
  let i = gitAt + 1;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    i += tokens[i] === "-C" || tokens[i] === "-c" ? 2 : 1;
  }
  return i < tokens.length ? tokens[i] : null;
}

// A guard returns null or a verdict. "deny" blocks the call outright and is
// reserved for secrets. "ask" pauses for the owner's yes or no.
function verdict(level, reason) {
  return { level, reason };
}

// Any deny beats the first ask.
function strongestVerdict(verdicts) {
  const found = verdicts.filter(Boolean);
  return found.find((v) => v.level === "deny") || found[0] || null;
}

// Writes a verdict the way the harness reads it and returns the exit code.
function reportVerdict(v) {
  if (!v) return 0;
  if (v.level === "deny") {
    console.error(`BLOCKED: ${v.reason}`);
    return 2;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: v.reason,
      },
    }),
  );
  return 0;
}

module.exports = {
  collectStrings,
  extractCommand,
  extractExplicitFilePaths,
  extractFilePaths,
  gitSubcommand,
  readInput,
  reportVerdict,
  splitSegments,
  strongestVerdict,
  tokenize,
  verdict,
};
