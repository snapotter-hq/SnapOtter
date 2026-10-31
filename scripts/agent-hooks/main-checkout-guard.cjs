// Blocks commands that move the shared main checkout's branch, index, or
// working tree. Parallel sessions all run helper scripts from that checkout,
// so one session's checkout or stash changes the ground under every other.
// Issue work belongs in a worktree under .worktrees/.

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { splitSegments, tokenize, verdict } = require("./input.cjs");

const GIT_MUTATORS = new Set([
  "am",
  "checkout",
  "cherry-pick",
  "clean",
  "commit",
  "merge",
  "pull",
  "rebase",
  "reset",
  "restore",
  "revert",
  "stash",
  "switch",
]);
const READ_ONLY_STASH = new Set(["list", "show"]);
// Only this repo's shared checkout; other repos' checkouts are none of our business.
// Asked from git, not derived from __dirname: in a linked worktree, ../../.git is a file.
function thisRepoGitDir() {
  try {
    const out = execFileSync(
      "git",
      ["-C", __dirname, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return path.resolve(out.trim());
  } catch {
    return null;
  }
}

function isPrimaryCheckout(dir) {
  try {
    const [gitDir, commonDir] = execFileSync(
      "git",
      ["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n");
    return Boolean(gitDir) && gitDir === commonDir && path.resolve(commonDir) === thisRepoGitDir();
  } catch {
    return false;
  }
}

// Returns { sub, args, dir } for a git or `gh pr checkout` invocation, or null.
function parseInvocation(tokens, dir) {
  const gitAt = tokens.indexOf("git");
  if (gitAt !== -1) {
    let i = gitAt + 1;
    let target = dir;
    while (i < tokens.length && tokens[i].startsWith("-")) {
      if (tokens[i] === "-C" && tokens[i + 1]) {
        target = path.resolve(target, tokens[i + 1]);
        i += 2;
      } else if (tokens[i] === "-c" && tokens[i + 1]) {
        i += 2;
      } else {
        i += 1;
      }
    }
    if (i < tokens.length) {
      return { sub: tokens[i], args: tokens.slice(i + 1), dir: target };
    }
  }
  const ghAt = tokens.indexOf("gh");
  if (ghAt !== -1 && tokens[ghAt + 1] === "pr" && tokens[ghAt + 2] === "checkout") {
    return { sub: "gh pr checkout", args: [], dir };
  }
  return null;
}

function isAllowed({ sub, args }) {
  if (sub === "gh pr checkout") {
    return false;
  }
  if (!GIT_MUTATORS.has(sub)) {
    return true;
  }
  // Returning the checkout to main is the repair, not the hazard.
  if ((sub === "switch" || sub === "checkout") && args.length === 1 && args[0] === "main") {
    return true;
  }
  if (sub === "stash" && READ_ONLY_STASH.has(args[0])) {
    return true;
  }
  return false;
}

function mainCheckoutVerdict(command, cwd) {
  let dir = cwd || process.cwd();
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment.trim());
    if (tokens[0] === "cd" && tokens[1]) {
      dir = path.resolve(dir, tokens[1].replace(/^~(?=\/|$)/, process.env.HOME || "~"));
      continue;
    }
    const invocation = parseInvocation(tokens, dir);
    if (!invocation || isAllowed(invocation) || !isPrimaryCheckout(invocation.dir)) {
      continue;
    }
    const label = invocation.sub === "gh pr checkout" ? invocation.sub : `git ${invocation.sub}`;
    return verdict(
      "ask",
      `${label} in the shared main checkout changes state under every other session. Work in a worktree: git worktree add .worktrees/<name> -b <branch> origin/main. Approve only if this is intended.`,
    );
  }
  return null;
}

module.exports = { mainCheckoutVerdict };
