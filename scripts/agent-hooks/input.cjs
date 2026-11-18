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

// Splits a shell command the way the shell runs it: at && || ; | and newlines,
// but never inside quotes, $( ), or a heredoc body. Each command comes back as
// { line, heredocs }, where line is the command without its heredoc bodies.
// The guards that match on a command's own words use this, so text inside a
// message or a grep pattern no longer reads as a git or gh invocation.
// splitSegments stays the cruder, broader split for the secret guards.
function splitCommands(command) {
  const s = String(command || "");
  const commands = [];
  let line = "";
  let heredocs = [];
  let pending = [];
  let quote = null;
  let depth = 0;
  const flush = () => {
    if (line.trim() || heredocs.length > 0) commands.push({ line, heredocs });
    line = "";
    heredocs = [];
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < s.length) {
        line += c + s[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      line += c;
      i += 1;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      line += c + s[i + 1];
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      line += c;
      i += 1;
      continue;
    }
    if (c === "$" && s[i + 1] === "(") {
      depth += 1;
      line += "$(";
      i += 2;
      continue;
    }
    if (c === ")" && depth > 0) {
      depth -= 1;
      line += c;
      i += 1;
      continue;
    }
    if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<") {
      const m = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(s.slice(i));
      if (m) {
        pending.push(m[2]);
        line += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (c === "\n" && pending.length > 0) {
      i += 1;
      for (const delimiter of pending) {
        const body = [];
        while (i < s.length) {
          const end = s.indexOf("\n", i);
          const next = s.slice(i, end === -1 ? s.length : end);
          i = end === -1 ? s.length : end + 1;
          if (next.replace(/^\t+/, "") === delimiter) break;
          body.push(next);
        }
        heredocs.push(body.join("\n"));
      }
      pending = [];
      flush();
      continue;
    }
    if (depth === 0) {
      if ((c === "&" && s[i + 1] === "&") || (c === "|" && s[i + 1] === "|")) {
        flush();
        i += 2;
        continue;
      }
      if (c === ";" || c === "|" || c === "\n") {
        flush();
        i += 1;
        continue;
      }
    }
    line += c;
    i += 1;
  }
  flush();
  return commands;
}

// Expands $NAME and ${NAME} from earlier assignments in the same command, then
// from the hook's environment. Unknown names are left as written.
function expandVars(text, vars) {
  return text.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (match, name) => {
    if (vars && Object.hasOwn(vars, name)) return vars[name];
    return process.env[name] ?? match;
  });
}

// Records NAME=value and export NAME=value; returns true when the tokens were
// only assignments.
function recordAssignments(tokens, vars) {
  const words = tokens[0] === "export" ? tokens.slice(1) : tokens;
  if (words.length === 0) return false;
  const assignments = words.map((t) => /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(t));
  if (assignments.some((a) => !a)) return false;
  for (const [, name, value] of assignments) vars[name] = expandVars(value, vars);
  return true;
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
  expandVars,
  extractCommand,
  extractExplicitFilePaths,
  extractFilePaths,
  gitSubcommand,
  readInput,
  recordAssignments,
  reportVerdict,
  splitCommands,
  splitSegments,
  strongestVerdict,
  tokenize,
  verdict,
};
