// Blocks commands that write to GitHub unless gh's active account is
// snapotter-hq. The active account is global to the machine, so a terminal on
// another project can switch it while a SnapOtter session is mid-task.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { splitSegments, tokenize, verdict } = require("./input.cjs");

const REQUIRED = "snapotter-hq";

const GH_WRITES = {
  pr: [
    "create",
    "merge",
    "comment",
    "edit",
    "close",
    "reopen",
    "review",
    "ready",
    "lock",
    "unlock",
  ],
  issue: [
    "create",
    "comment",
    "edit",
    "close",
    "reopen",
    "delete",
    "transfer",
    "lock",
    "unlock",
    "pin",
    "unpin",
  ],
  label: ["create", "edit", "delete", "clone"],
  workflow: ["run", "enable", "disable"],
  run: ["rerun", "cancel", "delete"],
  release: ["create", "edit", "delete", "upload", "delete-asset"],
  repo: ["edit", "delete", "rename", "archive", "unarchive", "sync"],
  secret: ["set", "delete"],
  variable: ["set", "delete"],
  gist: ["create", "edit", "delete"],
};

function activeAccount() {
  const dir = process.env.GH_CONFIG_DIR || path.join(os.homedir(), ".config", "gh");
  try {
    const text = fs.readFileSync(path.join(dir, "hosts.yml"), "utf8");
    const block = text.split(/^(?=\S)/m).find((b) => b.startsWith("github.com:")) || "";
    return block.match(/^ {4}user: *(\S+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

// gh api writes when it names a non-GET method or passes fields (which make it a POST).
function isApiWrite(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const method =
      a === "-X" || a === "--method" ? args[i + 1] : a.match(/^(?:-X|--method=)(\w+)$/)?.[1];
    if (method && method.toUpperCase() !== "GET") return true;
    if (/^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a)) return true;
  }
  return false;
}

function describeWrite(tokens) {
  const gitAt = tokens.indexOf("git");
  if (gitAt !== -1) {
    let i = gitAt + 1;
    while (i < tokens.length && tokens[i].startsWith("-"))
      i += tokens[i] === "-C" || tokens[i] === "-c" ? 2 : 1;
    if (tokens[i] === "push") return "git push";
  }
  const ghAt = tokens.indexOf("gh");
  if (ghAt === -1) return null;
  const [group, sub, ...rest] = tokens
    .slice(ghAt + 1)
    .filter((t, i, all) => !(t === "-R" || all[i - 1] === "-R"));
  if (group === "api") return isApiWrite([sub, ...rest].filter(Boolean)) ? "gh api (write)" : null;
  return GH_WRITES[group]?.includes(sub) ? `gh ${group} ${sub}` : null;
}

function githubAccountVerdict(command) {
  let switched = false;
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment.trim());
    // A switch earlier in the same command line counts.
    if (
      tokens[0] === "gh" &&
      tokens[1] === "auth" &&
      tokens[2] === "switch" &&
      tokens.includes(REQUIRED)
    ) {
      switched = true;
      continue;
    }
    if (tokens.some((t) => /^GH_TOKEN=|^GITHUB_TOKEN=/.test(t))) continue;
    const write = describeWrite(tokens);
    if (!write || switched) continue;
    const active = activeAccount();
    if (active === REQUIRED) return null;
    return verdict(
      "ask",
      `${write} would run as gh account "${active ?? "unknown"}", not ${REQUIRED}. Run \`gh auth switch --user ${REQUIRED}\` first, or approve this run.`,
    );
  }
  return null;
}

module.exports = { githubAccountVerdict };
