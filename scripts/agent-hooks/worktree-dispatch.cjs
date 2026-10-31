#!/usr/bin/env node
// Runs this repo's guard hooks for sessions started inside a linked worktree.
// Worktrees get neither .claude/settings.json nor scripts/agent-hooks (both
// gitignored), so without this a worktree session runs no guards at all. Wired
// from the user-level ~/.claude/settings.json; a no-op everywhere else,
// including the main checkout, whose own project settings already run them.
//
//   node worktree-dispatch.cjs guard-command.cjs|protect-config.cjs

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAIN_GIT_DIR = path.resolve(__dirname, "../../.git");
const target = path.join(__dirname, path.basename(process.argv[2] || ""));

function gitDirs(cwd) {
  try {
    const [gitDir, commonDir] = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n");
    return { gitDir, commonDir };
  } catch {
    return null;
  }
}

const raw = fs.readFileSync(0, "utf8");
let cwd = process.cwd();
try {
  cwd = JSON.parse(raw).cwd || cwd;
} catch {}

const dirs = gitDirs(cwd);
const inLinkedWorktree =
  dirs && path.resolve(dirs.commonDir) === MAIN_GIT_DIR && dirs.gitDir !== dirs.commonDir;
if (!inLinkedWorktree || !fs.existsSync(target)) process.exit(0);

const result = spawnSync(process.execPath, [target], {
  input: raw,
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(result.status ?? 0);
