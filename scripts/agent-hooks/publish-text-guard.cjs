// Keeps outward text written from the shell inside AGENTS.md rules: no agent
// session links or trailers, no em dashes, and no credentials. Squash merges
// must pin the reviewed head and carry an explicit subject. The text check reads
// --body-file and -F inputs too. Session links, em dashes (and a spaced double hyphen used as
// one), and merge gaps ask;
// a credential denies.

const fs = require("node:fs");
const path = require("node:path");
const {
  expandVars,
  gitSubcommand,
  recordAssignments,
  splitCommands,
  tokenize,
  verdict,
} = require("./input.cjs");
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
const EM_DASH = /\u2014/;
// A space-delimited `--` is the ASCII stand-in for a dash. Only message text is
// checked (inline values and body files), never the command line itself, where
// ` -- ` ends options and flags like --body-file start with it.
const DOUBLE_HYPHEN_DASH = /(^|\s)--(\s|$)/m;
const MESSAGE_FLAGS = new Set(["-m", "--message", "-b", "--body", "-t", "--title", "--subject"]);

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

// Values passed inline as the message, title, or body.
function inlineMessages(tokens) {
  const values = [];
  tokens.forEach((token, i) => {
    if (MESSAGE_FLAGS.has(token) && tokens[i + 1] !== undefined) values.push(tokens[i + 1]);
    const eq = token.match(/^(--message|--body|--title|--subject)=(.*)$/s);
    if (eq) values.push(eq[2]);
  });
  return values;
}

// Code spans and fenced blocks may quote a literal `--` (a flag list, a diff).
function withoutCode(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

// A heredoc redirected into a file earlier in the same command, such as
// `cat > "$S/body.md" <<'EOF'`. Returns the target path or null.
function heredocTarget(tokens) {
  const at = tokens.findIndex((t) => t === ">" || t === ">>" || t === "tee");
  if (at !== -1 && tokens[at + 1] && !tokens[at + 1].startsWith("-")) return tokens[at + 1];
  const glued = tokens.find((t) => /^>>?[^>&]/.test(t));
  return glued ? glued.replace(/^>>?/, "") : null;
}

// Text of the files a command reads its message from, including files the
// same command wrote from a heredoc. Returns the unreadable paths too, because
// an unverifiable body must not pass silently.
function bodyText(tokens, dir, vars, written, heredocs) {
  const texts = [];
  const unreadable = [];
  tokens.forEach((token, i) => {
    let file = null;
    if (BODY_FLAGS.has(token)) file = tokens[i + 1];
    else if (token.startsWith("--body-file=")) file = token.slice("--body-file=".length);
    if (!file) return;
    if (file === "-") {
      texts.push(...heredocs);
      return;
    }
    const resolved = path.resolve(dir, expandVars(file, vars));
    if (written.has(resolved)) {
      texts.push(written.get(resolved));
      return;
    }
    try {
      texts.push(fs.readFileSync(resolved, "utf8"));
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
  let prose = "";
  let message = "";
  const vars = {};
  const written = new Map();
  for (const { line, heredocs } of splitCommands(command)) {
    const tokens = tokenize(line.trim());
    if (tokens[0] === "cd" && tokens[1]) {
      const target = expandVars(tokens[1], vars).replace(/^~(?=\/|$)/, process.env.HOME || "~");
      dir = path.resolve(dir, target);
      continue;
    }
    if (recordAssignments(tokens, vars)) continue;
    const target = heredocs.length > 0 ? heredocTarget(tokens) : null;
    if (target) written.set(path.resolve(dir, expandVars(target, vars)), heredocs.join("\n"));
    const kind = kindOf(tokens);
    if (!kind) continue;
    if (kind === "gh pr merge" && !mergeArgsOk(tokens)) {
      return verdict(
        "ask",
        "gh pr merge is missing --match-head-commit <sha> or an explicit --subject (AGENTS.md, squash merge). Add both, or approve this merge as written.",
      );
    }
    const body = bodyText(tokens, dir, vars, written, heredocs);
    if (body.unreadable.length > 0) {
      return verdict(
        "ask",
        `could not read ${body.unreadable.join(", ")} to check it for AGENTS.md rules. Check that the file exists.`,
      );
    }
    outward = true;
    bodies += `\n${body.text}`;
    message += `\n${line}\n${body.text}`;
    prose += `\n${body.text}\n${inlineMessages(tokens).join("\n")}`;
  }
  if (!outward) return null;

  // Credentials are checked across the whole command; the style rules only
  // look at the outward commands and their bodies, so a grep for an em dash
  // elsewhere in the same command does not trip them.
  const text = `${command}${bodies}`;
  const credential = findCredential(text);
  if (credential) {
    return verdict(
      "deny",
      `${credential} is in the commit, PR, or issue text. Remove it before publishing.`,
    );
  }
  if (SESSION_LINK.test(message)) {
    return verdict(
      "ask",
      "agent session links and Claude-Session trailers are not allowed in commits, PRs, or issues (AGENTS.md). Remove them, or approve this text as written.",
    );
  }
  if (EM_DASH.test(message)) {
    return verdict(
      "ask",
      "em dashes are banned in commits, PRs, and issues (AGENTS.md). Use commas, colons, parentheses, or separate sentences, or approve this text as written.",
    );
  }
  if (DOUBLE_HYPHEN_DASH.test(withoutCode(prose))) {
    return verdict(
      "ask",
      "a spaced double hyphen reads as a dash, which AGENTS.md bans in commits, PRs, and issues. Use commas, colons, parentheses, or separate sentences, or approve this text as written.",
    );
  }
  return null;
}

module.exports = { publishTextVerdict };
