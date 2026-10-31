// Keeps outward text written from the shell inside AGENTS.md rules: no agent
// session links or trailers, no em dashes, and no credentials. Squash merges
// must pin the reviewed head and carry an explicit subject. The text check reads
// --body-file and -F inputs too. Session links, em dashes, and merge gaps ask;
// a credential denies.

const fs = require("node:fs");
const path = require("node:path");
const { gitSubcommand, splitSegments, tokenize, verdict } = require("./input.cjs");
const { findCredential } = require("./secret-content-guard.cjs");

const OUTWARD_KINDS = new Set([
  "git commit",
  "gh pr create",
  "gh pr edit",
  "gh pr comment",
  "gh pr merge",
  "gh issue create",
  "gh issue comment",
]);
const BODY_FLAGS = new Set(["-F", "--file", "--body-file"]);
const SESSION_LINK = /Claude-Session:|claude\.ai\/code\/session/i;
const EM_DASH = /—/;

function kindOf(tokens) {
  if (gitSubcommand(tokens) === "commit") return "git commit";
  const ghAt = tokens.indexOf("gh");
  if (ghAt === -1) return null;
  const rest = tokens.slice(ghAt + 1).filter((t, i, all) => !(t === "-R" || all[i - 1] === "-R"));
  const kind = `gh ${rest[0]} ${rest[1]}`;
  return OUTWARD_KINDS.has(kind) ? kind : null;
}

function mergeArgsOk(tokens) {
  const has = (flag) => tokens.some((t) => t === flag || t.startsWith(`${flag}=`));
  return has("--match-head-commit") && (has("--subject") || has("-t"));
}

// Text of the files a command reads its message from. Returns the unreadable
// paths too, because an unverifiable body must not pass silently.
function bodyText(tokens, dir) {
  const texts = [];
  const unreadable = [];
  tokens.forEach((token, i) => {
    let file = null;
    if (BODY_FLAGS.has(token)) file = tokens[i + 1];
    else if (token.startsWith("--body-file=")) file = token.slice("--body-file=".length);
    if (!file || file === "-") return;
    try {
      texts.push(fs.readFileSync(path.resolve(dir, file), "utf8"));
    } catch {
      unreadable.push(file);
    }
  });
  return { text: texts.join("\n"), unreadable };
}

function publishTextVerdict(command, cwd) {
  let dir = cwd || process.cwd();
  let outward = false;
  let bodies = "";
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment.trim());
    if (tokens[0] === "cd" && tokens[1]) {
      dir = path.resolve(dir, tokens[1].replace(/^~(?=\/|$)/, process.env.HOME || "~"));
      continue;
    }
    const kind = kindOf(tokens);
    if (!kind) continue;
    if (kind === "gh pr merge" && !mergeArgsOk(tokens)) {
      return verdict(
        "ask",
        "gh pr merge is missing --match-head-commit <sha> or an explicit --subject (AGENTS.md, squash merge). Add both, or approve this merge as written.",
      );
    }
    const body = bodyText(tokens, dir);
    if (body.unreadable.length > 0) {
      return verdict(
        "ask",
        `could not read ${body.unreadable.join(", ")} to check it for AGENTS.md rules. Check that the file exists.`,
      );
    }
    outward = true;
    bodies += `\n${body.text}`;
  }
  if (!outward) return null;

  const text = `${command}${bodies}`;
  const credential = findCredential(text);
  if (credential) {
    return verdict(
      "deny",
      `${credential} is in the commit, PR, or issue text. Remove it before publishing.`,
    );
  }
  if (SESSION_LINK.test(text)) {
    return verdict(
      "ask",
      "agent session links and Claude-Session trailers are not allowed in commits, PRs, or issues (AGENTS.md). Remove them, or approve this text as written.",
    );
  }
  if (EM_DASH.test(text)) {
    return verdict(
      "ask",
      "em dashes are banned in commits, PRs, and issues (AGENTS.md). Use commas, colons, parentheses, or separate sentences, or approve this text as written.",
    );
  }
  return null;
}

module.exports = { publishTextVerdict };
