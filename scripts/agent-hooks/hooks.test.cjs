// Tests for the shared agent hooks. Run with:
//   node --test scripts/agent-hooks/hooks.test.cjs

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { gitSubcommand, splitSegments, tokenize } = require("./input.cjs");
const { envSecretVerdict, isSecretPath } = require("./env-secret-guard.cjs");
const { protectedCommandVerdict, writeTargets } = require("./protect-config.cjs");
const { publishTextVerdict } = require("./publish-text-guard.cjs");
const { findCredential, secretContentVerdict } = require("./secret-content-guard.cjs");
const { commandVerdict, hasCommitBypass } = require("./guard-command.cjs");

const GUARD = path.join(__dirname, "guard-command.cjs");
// The primary checkout, even when the tests run from a linked worktree.
const REPO_ROOT = path.dirname(
  execFileSync(
    "git",
    ["-C", __dirname, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      encoding: "utf8",
    },
  ).trim(),
);

// Built from pieces so this file never holds a live-looking token.
const FAKE_GH_TOKEN = `ghp_${"1234567890abcdefghijklmnopqrstuvwxyz"}`;
const FAKE_PASSWORD = ["password=", "correct-horse-battery-9"].join("");

let scratch;
let repo;

function git(dir, args) {
  return execFileSync(
    "git",
    ["-C", dir, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-hooks-test-"));
  fs.writeFileSync(path.join(scratch, "body-ok.md"), "Summary of the change.\n");
  fs.writeFileSync(
    path.join(scratch, "body-session.md"),
    "Claude-Session: https://claude.ai/code/session_1\n",
  );
  fs.writeFileSync(path.join(scratch, "body-dash.md"), "Fixes a bug — see below.\n");
  fs.writeFileSync(path.join(scratch, "body-secret.md"), `Uses ${FAKE_GH_TOKEN} for auth.\n`);

  repo = path.join(scratch, "repo");
  fs.mkdirSync(repo);
  git(repo, ["init", "-q"]);
  fs.writeFileSync(path.join(repo, "seed.txt"), "seed\n");
  git(repo, ["add", "seed.txt"]);
  git(repo, ["commit", "-q", "-m", "seed"]);
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

// Runs the real guard the way the harness does: JSON on stdin.
function runGuard(command, cwd = scratch) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }),
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("input helpers", () => {
  it("splits on chained operators and newlines", () => {
    assert.deepEqual(
      splitSegments("a && b || c; d | e\nf").map((s) => s.trim()),
      ["a", "b", "c", "d", "e", "f"],
    );
  });

  it("tokenizes quoted arguments as one token", () => {
    assert.deepEqual(tokenize(`git commit -m "fix: a b"`), ["git", "commit", "-m", "fix: a b"]);
  });

  it("finds the git subcommand past global options", () => {
    assert.equal(gitSubcommand(tokenize("git -C ../x commit -m y")), "commit");
    assert.equal(gitSubcommand(tokenize("git -c user.name=a log")), "log");
    assert.equal(gitSubcommand(tokenize("ls -la")), null);
  });
});

describe("secret file guard", () => {
  it("recognizes secret files and leaves the template alone", () => {
    assert.ok(isSecretPath(".license-signing-key"));
    assert.ok(isSecretPath(".env"));
    assert.ok(isSecretPath(".env.local"));
    assert.ok(isSecretPath("~/.config/snapotter/cloudflare.env"));
    assert.equal(isSecretPath("apps/web/.env.example"), false);
    assert.equal(isSecretPath("src/index.ts"), false);
  });

  it("denies printing a secret file, including through grep and sed", () => {
    for (const command of ["cat .license-signing-key", "grep TOKEN .env", "sed -n 1p .env"]) {
      assert.equal(envSecretVerdict(command, scratch)?.level, "deny", command);
    }
  });

  it("denies staging a secret file", () => {
    assert.equal(envSecretVerdict("git add .license-signing-key", scratch)?.level, "deny");
  });

  it("asks before forced adds and copies of secret files", () => {
    assert.equal(envSecretVerdict("git add -f dist/app.js", scratch)?.level, "ask");
    assert.equal(envSecretVerdict("cp .env backup.env", scratch)?.level, "ask");
  });

  it("allows sourcing an env file and reading the template", () => {
    assert.equal(envSecretVerdict("set -a; source .env; set +a", scratch), null);
    assert.equal(envSecretVerdict("cat apps/web/.env.example", scratch), null);
  });

  it("denies a commit while a secret file is staged in a real repo", () => {
    fs.writeFileSync(path.join(repo, ".env"), "TOKEN=x\n");
    git(repo, ["add", "-f", ".env"]);
    try {
      assert.equal(envSecretVerdict("git commit -m x", repo)?.level, "deny");
    } finally {
      git(repo, ["rm", "-q", "--cached", ".env"]);
      fs.rmSync(path.join(repo, ".env"));
    }
  });
});

describe("credential content guard", () => {
  it("finds a token and a credential assignment", () => {
    assert.match(findCredential(FAKE_GH_TOKEN) ?? "", /GitHub token/);
    assert.match(findCredential(FAKE_PASSWORD) ?? "", /credential assignment/);
  });

  it("does not flag variable references", () => {
    assert.equal(findCredential("token = process.env.GITHUB_TOKEN"), null);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is a literal placeholder
    assert.equal(findCredential('token: "${TOKEN}"'), null);
  });

  it("denies a token pasted into a command", () => {
    assert.equal(secretContentVerdict(`echo ${FAKE_GH_TOKEN}`, scratch)?.level, "deny");
  });

  it("denies a token in staged changes and allows clean ones", () => {
    fs.writeFileSync(path.join(repo, "leak.txt"), `key ${FAKE_GH_TOKEN}\n`);
    git(repo, ["add", "leak.txt"]);
    try {
      assert.equal(secretContentVerdict("git commit -m fix", repo)?.level, "deny");
    } finally {
      git(repo, ["rm", "-q", "--cached", "leak.txt"]);
      fs.rmSync(path.join(repo, "leak.txt"));
    }
    assert.equal(secretContentVerdict("git commit -m fix", repo), null);
  });

  it("denies a push whose unpushed commits contain a token", () => {
    fs.writeFileSync(path.join(repo, "notes.txt"), `${FAKE_GH_TOKEN}\n`);
    git(repo, ["add", "notes.txt"]);
    git(repo, ["commit", "-q", "-m", "add notes"]);
    try {
      assert.equal(secretContentVerdict("git push origin main", repo)?.level, "deny");
    } finally {
      git(repo, ["reset", "-q", "--hard", "HEAD~1"]);
    }
  });
});

describe("protected config guard from the shell", () => {
  const asks = [
    "sed -i 's/a/b/' biome.json",
    "sed -i.bak s/a/b/ tsconfig.base.json",
    "echo {} > tsconfig.json",
    "echo {} >tsconfig.json",
    "cp scratch.json tsconfig.json",
    "dd if=/dev/zero of=biome.json",
    "tee .editorconfig < /dev/null",
  ];
  for (const command of asks) {
    it(`asks on: ${command}`, () => {
      assert.equal(protectedCommandVerdict(command)?.level, "ask");
    });
  }

  const allowed = [
    "cat biome.json",
    "git diff -- biome.json > /tmp/out.diff",
    "grep -n tsconfig package.json",
    "pnpm lint:fix",
    "cp biome.json /tmp/biome.bak",
  ];
  for (const command of allowed) {
    it(`allows: ${command}`, () => {
      assert.equal(protectedCommandVerdict(command), null);
    });
  }

  it("names only the write target, not the source", () => {
    assert.deepEqual(writeTargets(tokenize("cp biome.json backup.json")), ["backup.json"]);
    assert.deepEqual(writeTargets(tokenize("mv biome.json old.json")), ["biome.json", "old.json"]);
    assert.deepEqual(writeTargets(tokenize("cat biome.json")), []);
  });
});

describe("publish text guard", () => {
  it("asks on a Claude-Session trailer in a commit", () => {
    const command = `git commit -m "feat: x\n\nClaude-Session: https://claude.ai/code/session_1"`;
    assert.equal(publishTextVerdict(command, scratch)?.level, "ask");
  });

  it("asks on a session link in PR text", () => {
    const command = `gh pr create --title t --body "see https://claude.ai/code/session_abc"`;
    assert.equal(publishTextVerdict(command, scratch)?.level, "ask");
  });

  it("asks on em dashes in an inline commit message and in a body file", () => {
    assert.equal(publishTextVerdict(`git commit -m "fix: a — b"`, scratch)?.level, "ask");
    assert.equal(
      publishTextVerdict("gh pr create --title t --body-file body-dash.md", scratch)?.level,
      "ask",
    );
  });

  it("asks on session links in a -F commit message file", () => {
    assert.equal(publishTextVerdict("git commit -F body-session.md", scratch)?.level, "ask");
  });

  it("denies a credential in a body file", () => {
    assert.equal(
      publishTextVerdict("gh pr create --title t --body-file body-secret.md", scratch)?.level,
      "deny",
    );
  });

  it("denies a credential in an inline commit message", () => {
    assert.equal(
      publishTextVerdict(`git commit -m "fix: uses ${FAKE_GH_TOKEN}"`, scratch)?.level,
      "deny",
    );
  });

  it("asks when a body file cannot be read", () => {
    assert.equal(publishTextVerdict("gh pr create --body-file missing.md", scratch)?.level, "ask");
  });

  it("checks the text when the repo flag precedes the subcommand", () => {
    const command = `gh -R owner/repo pr create --body "a — b"`;
    assert.equal(publishTextVerdict(command, scratch)?.level, "ask");
  });

  it("asks on squash merges without a pinned head and subject", () => {
    const ok = "gh pr merge 5 --squash --match-head-commit abc123 --subject 'feat: x'";
    assert.equal(publishTextVerdict(ok, scratch), null);
    assert.equal(publishTextVerdict("gh pr merge 5 --squash --subject 'x'", scratch)?.level, "ask");
    assert.equal(
      publishTextVerdict("gh pr merge 5 --squash --match-head-commit abc", scratch)?.level,
      "ask",
    );
  });

  it("allows clean commits, PRs, and read-only commands", () => {
    assert.equal(publishTextVerdict(`git commit -m "fix: plain text"`, scratch), null);
    assert.equal(
      publishTextVerdict("gh pr create --title t --body-file body-ok.md", scratch),
      null,
    );
    assert.equal(publishTextVerdict("git log --oneline", scratch), null);
    assert.equal(publishTextVerdict("gh issue view 5", scratch), null);
  });
});

describe("command verdict composition", () => {
  it("detects --no-verify and -n on commit", () => {
    assert.equal(hasCommitBypass("git commit --no-verify -m x"), true);
    assert.equal(hasCommitBypass("git commit -n -m x"), true);
    assert.equal(hasCommitBypass(`git commit -m "x"`), false);
  });

  it("lets a deny win over an ask in the same command", () => {
    const command = `git commit --no-verify -m "uses ${FAKE_GH_TOKEN}"`;
    assert.equal(commandVerdict(command, scratch)?.level, "deny");
  });

  it("returns ask for a bypass alone", () => {
    assert.equal(commandVerdict("git commit --no-verify -m 'fix: x'", scratch)?.level, "ask");
  });

  it("returns null for ordinary commands", () => {
    assert.equal(commandVerdict("pnpm lint", scratch), null);
  });
});

describe("guard-command end to end", () => {
  it("denies a credential with exit 2 and a BLOCKED message", () => {
    const result = runGuard(`echo ${FAKE_GH_TOKEN}`);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCKED: .*GitHub token/);
  });

  it("asks on a bypass with exit 0 and an ask decision on stdout", () => {
    const result = runGuard("git commit --no-verify -m 'fix: x'");
    assert.equal(result.status, 0);
    const decision = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(decision.hookEventName, "PreToolUse");
    assert.equal(decision.permissionDecision, "ask");
    assert.match(decision.permissionDecisionReason, /--no-verify/);
  });

  it("asks on a shell write to tsconfig", () => {
    const result = runGuard("sed -i 's/a/b/' tsconfig.json");
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "ask");
  });

  it("allows an ordinary command with no output", () => {
    const result = runGuard("pnpm lint");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  });

  it("asks before switching branches in the shared main checkout", () => {
    const result = runGuard("git switch -c scratch-branch", REPO_ROOT);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "ask");
  });

  it("fails open on malformed input", () => {
    const result = spawnSync(process.execPath, [GUARD], { input: "not json", encoding: "utf8" });
    assert.equal(result.status, 0);
  });
});
