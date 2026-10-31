#!/usr/bin/env node
// Shared command guard for Claude Code and Codex.
// Credentials and secret files are denied outright. Most other rules ask the
// owner first, so an intended exception stays one approval away. Release and
// model publishing is gated in AGENTS.md, which a hook cannot check.

const {
  extractCommand,
  readInput,
  reportVerdict,
  splitSegments,
  strongestVerdict,
  tokenize,
  verdict,
} = require("./input.cjs");
const { envSecretVerdict } = require("./env-secret-guard.cjs");
const { githubAccountVerdict } = require("./github-account-guard.cjs");
const { mainCheckoutVerdict } = require("./main-checkout-guard.cjs");
const { protectedCommandVerdict } = require("./protect-config.cjs");
const { publishTextVerdict } = require("./publish-text-guard.cjs");
const { secretContentVerdict } = require("./secret-content-guard.cjs");

function hasCommitBypass(command) {
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    const commitAt = tokens.indexOf("commit");
    if (commitAt === -1 || !tokens.slice(0, commitAt).includes("git")) {
      continue;
    }
    for (const token of tokens.slice(commitAt + 1)) {
      if (token === "--") {
        break;
      }
      if (token === "--no-verify" || token === "-n" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(token)) {
        return true;
      }
    }
  }
  return false;
}

function commandVerdict(command, cwd) {
  const cmd = String(command || "");

  return strongestVerdict([
    hasCommitBypass(cmd)
      ? verdict(
          "ask",
          "this skips git hooks with --no-verify or -n. AGENTS.md says fix the underlying issue. Approve only if the skip is intended.",
        )
      : null,
    secretContentVerdict(cmd, cwd),
    envSecretVerdict(cmd, cwd),
    protectedCommandVerdict(cmd),
    publishTextVerdict(cmd, cwd),
    mainCheckoutVerdict(cmd, cwd),
    githubAccountVerdict(cmd),
  ]);
}

if (require.main === module) {
  const input = readInput();
  process.exitCode = reportVerdict(commandVerdict(extractCommand(input), input.cwd));
}

module.exports = { commandVerdict, hasCommitBypass };
