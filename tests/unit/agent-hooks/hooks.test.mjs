// Tests for the shared agent hooks in scripts/agent-hooks/.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const HOOKS = path.resolve(import.meta.dirname, "../../../scripts/agent-hooks");
const { gitSubcommand, splitSegments, tokenize } = require(path.join(HOOKS, "input.cjs"));
const { envSecretVerdict, isSecretPath } = require(path.join(HOOKS, "env-secret-guard.cjs"));
const { protectedCommandVerdict, writeTargets } = require(path.join(HOOKS, "protect-config.cjs"));
const { publishTextVerdict } = require(path.join(HOOKS, "publish-text-guard.cjs"));
const { findCredential, secretContentVerdict } = require(
  path.join(HOOKS, "secret-content-guard.cjs"),
);
const { commandVerdict, hasCommitBypass } = require(path.join(HOOKS, "guard-command.cjs"));

const GUARD = path.join(HOOKS, "guard-command.cjs");
// The primary checkout, even when the tests run from a linked worktree.
const REPO_ROOT = path.dirname(
  execFileSync("git", ["-C", HOOKS, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).trim(),
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
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

beforeAll(() => {
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

afterAll(() => {
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
    expect(splitSegments("a && b || c; d | e\nf").map((s) => s.trim())).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("tokenizes quoted arguments as one token", () => {
    expect(tokenize(`git commit -m "fix: a b"`)).toEqual(["git", "commit", "-m", "fix: a b"]);
  });

  it("finds the git subcommand past global options", () => {
    expect(gitSubcommand(tokenize("git -C ../x commit -m y"))).toBe("commit");
    expect(gitSubcommand(tokenize("git -c user.name=a log"))).toBe("log");
    expect(gitSubcommand(tokenize("ls -la"))).toBeNull();
  });
});

describe("secret file guard", () => {
  it("recognizes secret files and leaves the template alone", () => {
    expect(isSecretPath(".license-signing-key")).toBe(true);
    expect(isSecretPath(".env")).toBe(true);
    expect(isSecretPath(".env.local")).toBe(true);
    expect(isSecretPath("~/.config/snapotter/cloudflare.env")).toBe(true);
    expect(isSecretPath("apps/web/.env.example")).toBe(false);
    expect(isSecretPath("src/index.ts")).toBe(false);
  });

  it("denies printing a secret file, including through grep and sed", () => {
    for (const command of ["cat .license-signing-key", "grep TOKEN .env", "sed -n 1p .env"]) {
      expect(envSecretVerdict(command, scratch)?.level, command).toBe("deny");
    }
  });

  it("denies staging a secret file", () => {
    expect(envSecretVerdict("git add .license-signing-key", scratch)?.level).toBe("deny");
  });

  it("asks before forced adds and copies of secret files", () => {
    expect(envSecretVerdict("git add -f dist/app.js", scratch)?.level).toBe("ask");
    expect(envSecretVerdict("cp .env backup.env", scratch)?.level).toBe("ask");
  });

  it("allows sourcing an env file and reading the template", () => {
    expect(envSecretVerdict("set -a; source .env; set +a", scratch)).toBeNull();
    expect(envSecretVerdict("cat apps/web/.env.example", scratch)).toBeNull();
  });

  it("denies a commit while a secret file is staged in a real repo", () => {
    fs.writeFileSync(path.join(repo, ".env"), "TOKEN=x\n");
    git(repo, ["add", "-f", ".env"]);
    try {
      expect(envSecretVerdict("git commit -m x", repo)?.level).toBe("deny");
    } finally {
      git(repo, ["rm", "-q", "--cached", ".env"]);
      fs.rmSync(path.join(repo, ".env"));
    }
  });
});

describe("credential content guard", () => {
  it("finds a token and a credential assignment", () => {
    expect(findCredential(FAKE_GH_TOKEN)).toMatch(/GitHub token/);
    expect(findCredential(FAKE_PASSWORD)).toMatch(/credential assignment/);
  });

  it("does not flag variable references", () => {
    expect(findCredential("token = process.env.GITHUB_TOKEN")).toBeNull();
    // A literal placeholder, not an interpolation.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is a literal placeholder
    expect(findCredential('token: "${TOKEN}"')).toBeNull();
  });

  it("denies a token pasted into a command", () => {
    expect(secretContentVerdict(`echo ${FAKE_GH_TOKEN}`, scratch)?.level).toBe("deny");
  });

  it("denies a token in staged changes and allows clean ones", () => {
    fs.writeFileSync(path.join(repo, "leak.txt"), `key ${FAKE_GH_TOKEN}\n`);
    git(repo, ["add", "leak.txt"]);
    try {
      expect(secretContentVerdict("git commit -m fix", repo)?.level).toBe("deny");
    } finally {
      git(repo, ["rm", "-q", "--cached", "leak.txt"]);
      fs.rmSync(path.join(repo, "leak.txt"));
    }
    expect(secretContentVerdict("git commit -m fix", repo)).toBeNull();
  });

  it("denies a push whose unpushed commits contain a token", () => {
    fs.writeFileSync(path.join(repo, "notes.txt"), `${FAKE_GH_TOKEN}\n`);
    git(repo, ["add", "notes.txt"]);
    git(repo, ["commit", "-q", "-m", "add notes"]);
    try {
      expect(secretContentVerdict("git push origin main", repo)?.level).toBe("deny");
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
      expect(protectedCommandVerdict(command)?.level).toBe("ask");
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
      expect(protectedCommandVerdict(command)).toBeNull();
    });
  }

  it("names only the write target, not the source", () => {
    expect(writeTargets(tokenize("cp biome.json backup.json"))).toEqual(["backup.json"]);
    expect(writeTargets(tokenize("mv biome.json old.json"))).toEqual(["biome.json", "old.json"]);
    expect(writeTargets(tokenize("cat biome.json"))).toEqual([]);
  });
});

describe("publish text guard", () => {
  it("asks on a Claude-Session trailer in a commit", () => {
    const command = `git commit -m "feat: x\n\nClaude-Session: https://claude.ai/code/session_1"`;
    expect(publishTextVerdict(command, scratch)?.level).toBe("ask");
  });

  it("asks on a session link in PR text", () => {
    const command = `gh pr create --title t --body "see https://claude.ai/code/session_abc"`;
    expect(publishTextVerdict(command, scratch)?.level).toBe("ask");
  });

  it("asks on em dashes in an inline commit message and in a body file", () => {
    expect(publishTextVerdict(`git commit -m "fix: a — b"`, scratch)?.level).toBe("ask");
    expect(
      publishTextVerdict("gh pr create --title t --body-file body-dash.md", scratch)?.level,
    ).toBe("ask");
  });

  it("asks on session links in a -F commit message file", () => {
    expect(publishTextVerdict("git commit -F body-session.md", scratch)?.level).toBe("ask");
  });

  it("denies a credential in a body file", () => {
    expect(
      publishTextVerdict("gh pr create --title t --body-file body-secret.md", scratch)?.level,
    ).toBe("deny");
  });

  it("denies a credential in an inline commit message", () => {
    expect(publishTextVerdict(`git commit -m "fix: uses ${FAKE_GH_TOKEN}"`, scratch)?.level).toBe(
      "deny",
    );
  });

  it("asks when a body file cannot be read", () => {
    expect(publishTextVerdict("gh pr create --body-file missing.md", scratch)?.level).toBe("ask");
  });

  it("checks the text when the repo flag precedes the subcommand", () => {
    const command = `gh -R owner/repo pr create --body "a — b"`;
    expect(publishTextVerdict(command, scratch)?.level).toBe("ask");
  });

  it("asks on squash merges without a pinned head and subject", () => {
    const ok = "gh pr merge 5 --squash --match-head-commit abc123 --subject 'feat: x'";
    expect(publishTextVerdict(ok, scratch)).toBeNull();
    expect(publishTextVerdict("gh pr merge 5 --squash --subject 'x'", scratch)?.level).toBe("ask");
    expect(
      publishTextVerdict("gh pr merge 5 --squash --match-head-commit abc", scratch)?.level,
    ).toBe("ask");
  });

  it("allows clean commits, PRs, and read-only commands", () => {
    expect(publishTextVerdict(`git commit -m "fix: plain text"`, scratch)).toBeNull();
    expect(publishTextVerdict("gh pr create --title t --body-file body-ok.md", scratch)).toBeNull();
    expect(publishTextVerdict("git log --oneline", scratch)).toBeNull();
    expect(publishTextVerdict("gh issue view 5", scratch)).toBeNull();
  });
});

describe("command verdict composition", () => {
  it("detects --no-verify and -n on commit", () => {
    expect(hasCommitBypass("git commit --no-verify -m x")).toBe(true);
    expect(hasCommitBypass("git commit -n -m x")).toBe(true);
    expect(hasCommitBypass(`git commit -m "x"`)).toBe(false);
  });

  it("lets a deny win over an ask in the same command", () => {
    const command = `git commit --no-verify -m "uses ${FAKE_GH_TOKEN}"`;
    expect(commandVerdict(command, scratch)?.level).toBe("deny");
  });

  it("returns ask for a bypass alone", () => {
    expect(commandVerdict("git commit --no-verify -m 'fix: x'", scratch)?.level).toBe("ask");
  });

  it("returns null for ordinary commands", () => {
    expect(commandVerdict("pnpm lint", scratch)).toBeNull();
  });
});

describe("guard-command end to end", () => {
  it("denies a credential with exit 2 and a BLOCKED message", () => {
    const result = runGuard(`echo ${FAKE_GH_TOKEN}`);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED: .*GitHub token/);
  });

  it("asks on a bypass with exit 0 and an ask decision on stdout", () => {
    const result = runGuard("git commit --no-verify -m 'fix: x'");
    expect(result.status).toBe(0);
    const decision = JSON.parse(result.stdout).hookSpecificOutput;
    expect(decision.hookEventName).toBe("PreToolUse");
    expect(decision.permissionDecision).toBe("ask");
    expect(decision.permissionDecisionReason).toMatch(/--no-verify/);
  });

  it("asks on a shell write to tsconfig", () => {
    const result = runGuard("sed -i 's/a/b/' tsconfig.json");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("allows an ordinary command with no output", () => {
    const result = runGuard("pnpm lint");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("asks before switching branches in the shared main checkout", () => {
    const result = runGuard("git switch -c scratch-branch", REPO_ROOT);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("fails open on malformed input", () => {
    const result = spawnSync(process.execPath, [GUARD], { input: "not json", encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});
