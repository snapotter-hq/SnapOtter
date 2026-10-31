// Stops credentials from reaching the public repo or the session log. The file
// name guard (env-secret-guard) cannot see a token pasted into a source file or
// a command, so this one reads the text itself. It only ever denies.

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { gitSubcommand, splitSegments, tokenize, verdict } = require("./input.cjs");

const TOKEN_PATTERNS = [
  ["a private key", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ["an AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["a Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["a Hugging Face token", /\bhf_[A-Za-z0-9]{30,}\b/],
  ["a Stripe key", /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/],
  ["an API key (sk-)", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["a Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["a JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

// `password = "..."` style assignments. The value must look like a credential,
// not a variable reference such as process.env.TOKEN.
const ASSIGNMENT =
  /\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key)\b["']?\s*[:=]\s*["']?([^\s"'`$(){}]+)/gi;
const MEMBER_ACCESS = /^[A-Za-z_$][\w$]*(\.[\w$]+)+$/;

function looksLikeCredentialValue(value) {
  if (value.length < 16 || MEMBER_ACCESS.test(value)) return false;
  return /\d/.test(value) || value.length >= 24;
}

// Name of the credential found in text, or null.
function findCredential(text) {
  for (const [name, pattern] of TOKEN_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  for (const match of String(text).matchAll(ASSIGNMENT)) {
    if (looksLikeCredentialValue(match[1])) return "a credential assignment";
  }
  return null;
}

// Only added lines can leak, so removed lines and diff headers are skipped.
function addedLines(dir, args) {
  const out = execFileSync("git", ["-C", dir, ...args, "--unified=0", "--no-color"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
}

// A repo git cannot read yields nothing to scan. Other guards cover that case.
function scanRepo(dir, args) {
  try {
    return addedLines(dir, args);
  } catch {
    return "";
  }
}

function gitTargetDir(tokens, dir) {
  const gitAt = tokens.indexOf("git");
  if (gitAt === -1 || tokens[gitAt + 1] !== "-C" || !tokens[gitAt + 2]) return dir;
  return path.resolve(dir, tokens[gitAt + 2]);
}

function secretContentVerdict(command, cwd) {
  const inCommand = findCredential(command);
  if (inCommand) {
    return verdict(
      "deny",
      `${inCommand} is in the command text. Keep credentials in env vars or the gitignored secrets file. If this is a false positive, run the command yourself with \`!\`.`,
    );
  }

  let dir = cwd || process.cwd();
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment.trim());
    if (tokens[0] === "cd" && tokens[1]) {
      dir = path.resolve(dir, tokens[1]);
      continue;
    }
    const sub = gitSubcommand(tokens);
    if (sub !== "commit" && sub !== "push") continue;
    const target = gitTargetDir(tokens, dir);
    const scanned =
      sub === "commit"
        ? scanRepo(target, ["diff", "--cached"])
        : scanRepo(target, ["log", "HEAD", "--not", "--remotes", "-p", "--format="]);
    const found = findCredential(scanned);
    if (found) {
      const where = sub === "commit" ? "staged changes" : "unpushed commits";
      return verdict(
        "deny",
        `${found} is in ${where}. Remove it, rewrite the commit, and keep credentials in env vars or the gitignored secrets file.`,
      );
    }
  }
  return null;
}

module.exports = { findCredential, secretContentVerdict };
