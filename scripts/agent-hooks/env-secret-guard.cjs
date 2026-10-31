// Keeps secret files (.env, .env.local, cloudflare.env, .license-signing-key, ...)
// out of git and out of agent transcripts. .gitignore already covers them, but
// `git add -f` or an edited .gitignore gets past that, and printing one copies
// its tokens into the session log. .env.example is a template and stays allowed.

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { splitSegments, tokenize, verdict } = require("./input.cjs");

// Commands that show a file's contents. Output lands in the session log.
const PRINTERS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  "xxd",
  "od",
  "strings",
  "nl",
  "grep",
  "rg",
  "ugrep",
  "awk",
  "sed",
  "jq",
]);

// Commands that duplicate a file. A copy can drift out of the ignore rules.
const COPIERS = new Set(["cp", "mv", "ln", "tar", "zip", "rsync", "scp"]);

function isSecretPath(p) {
  const base = path.basename(String(p));
  if (base === ".env.example") return false;
  if (base === ".license-signing-key") return true;
  return /^\.env(\..+)?$/.test(base) || /.\.env$/.test(base);
}

function stagedSecrets(dir) {
  try {
    return execFileSync("git", ["-C", dir, "diff", "--cached", "--name-only"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(isSecretPath);
  } catch {
    return [];
  }
}

function envSecretVerdict(command, cwd) {
  let dir = cwd || process.cwd();
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment.trim());
    if (tokens[0] === "cd" && tokens[1]) {
      dir = path.resolve(dir, tokens[1]);
      continue;
    }
    if (PRINTERS.has(tokens[0]) && tokens.slice(1).some(isSecretPath)) {
      return verdict(
        "deny",
        "printing a secrets file copies its tokens into the session log. Load a .env file with `set -a; source <file>; set +a` instead.",
      );
    }
    if (COPIERS.has(tokens[0]) && tokens.slice(1).some(isSecretPath)) {
      return verdict("ask", `${tokens[0]} on a secrets file. Confirm the copy stays out of git.`);
    }
    const gitAt = tokens.indexOf("git");
    if (gitAt === -1) continue;
    let i = gitAt + 1;
    let target = dir;
    while (i < tokens.length && tokens[i].startsWith("-")) {
      if (tokens[i] === "-C" && tokens[i + 1]) target = path.resolve(target, tokens[i + 1]);
      i += tokens[i] === "-C" || tokens[i] === "-c" ? 2 : 1;
    }
    const sub = tokens[i];
    const args = tokens.slice(i + 1);
    if (sub === "add") {
      if (args.some(isSecretPath)) return verdict("deny", "never stage a secrets file.");
      if (args.some((a) => a === "-f" || a === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a))) {
        return verdict(
          "ask",
          "`git add --force` stages ignored files, which is how secrets get committed. Confirm the files are not secrets.",
        );
      }
    }
    if (sub === "commit" || sub === "push") {
      const staged = stagedSecrets(target);
      if (staged.length > 0) {
        return verdict(
          "deny",
          `${staged.join(", ")} is staged. Unstage it (git restore --staged <file>) before committing.`,
        );
      }
    }
  }
  return null;
}

module.exports = { envSecretVerdict, isSecretPath };
