// Tests for .husky/pre-push, the guard that keeps local-only paths out of pushes.
// Run with: node --test scripts/agent-hooks/pre-push.test.cjs

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PRE_PUSH = path.resolve(__dirname, "../../.husky/pre-push");

let scratch;
before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-test-"));
});
after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

let counter = 0;
function newRepo() {
  const dir = path.join(scratch, `repo-${counter++}`);
  fs.mkdirSync(dir);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  return dir;
}

function git(dir, args) {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Writes each file, then commits them all in one commit.
function commitFiles(dir, files, message = "change") {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    git(dir, ["add", "-f", rel]);
  }
  git(dir, ["commit", "-q", "-m", message]);
}

// Husky runs hooks with `sh -e`, so the tests do too. A plain `sh` run hides
// failures that only the real push reports.
function runPrePush(dir) {
  return spawnSync("sh", ["-e", PRE_PUSH], { cwd: dir, encoding: "utf8" });
}

describe("pre-push guard without an upstream", () => {
  const blocked = {
    "docs/plan.md": "internal plan\n",
    "AGENTS.md": "local rules\n",
    "CLAUDE.md": "local shim\n",
    ".claude/settings.json": "{}\n",
    ".env": "TOKEN=x\n",
    "apps/web/.env.local": "TOKEN=x\n",
    "branding/logo-512.png": "png\n",
    "scripts/branding/sync-og.sh": "echo\n",
    "scripts/generate-license.mjs": "export {};\n",
    "remotion/index.ts": "export {};\n",
  };
  for (const [file] of Object.entries(blocked)) {
    it(`blocks a push that adds ${file}`, () => {
      const repo = newRepo();
      commitFiles(repo, { [file]: "x\n" });
      const result = runPrePush(repo);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /local-only paths detected/);
      assert.match(result.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  }

  const allowed = [
    "apps/docs/guide.md",
    "branding/dashboard.gif",
    "branding/social-preview.png",
    "branding/sponsor-banner.svg",
    "apps/web/.env.example",
    "COMMUNITY_GUIDE.md",
    "README.md",
  ];
  for (const file of allowed) {
    it(`allows a push that adds ${file}`, () => {
      const repo = newRepo();
      commitFiles(repo, { [file]: "x\n" });
      assert.equal(runPrePush(repo).status, 0);
    });
  }
});

describe("pre-push guard with an upstream", () => {
  it("allows deleting a path that was already public", () => {
    const repo = newRepo();
    const remote = path.join(scratch, `remote-${counter++}.git`);
    git(scratch, ["init", "-q", "--bare", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    commitFiles(repo, { "branding/logo-64.png": "png\n" }, "add logo");
    git(repo, ["push", "-q", "-u", "origin", "HEAD"]);

    git(repo, ["rm", "-q", "branding/logo-64.png"]);
    git(repo, ["commit", "-q", "-m", "drop logo"]);
    assert.equal(runPrePush(repo).status, 0);
  });

  it("blocks a new local-only add on top of an upstream", () => {
    const repo = newRepo();
    const remote = path.join(scratch, `remote-${counter++}.git`);
    git(scratch, ["init", "-q", "--bare", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    commitFiles(repo, { "README.md": "public\n" }, "public");
    git(repo, ["push", "-q", "-u", "origin", "HEAD"]);

    commitFiles(repo, { "docs/new-plan.md": "private\n" }, "add plan");
    const result = runPrePush(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/new-plan\.md/);
  });

  // A new branch has no upstream yet, but its history is already on the remote.
  // Old public files in that history must not block the push.
  it("checks only unpushed commits when a new branch has no upstream", () => {
    const repo = newRepo();
    const remote = path.join(scratch, `remote-${counter++}.git`);
    git(scratch, ["init", "-q", "--bare", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    commitFiles(repo, { "branding/dashboard.gif": "gif\n" }, "public history");
    git(repo, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

    git(repo, ["checkout", "-q", "-b", "feature/clean"]);
    commitFiles(repo, { "src/app.ts": "export {};\n" }, "clean change");
    assert.equal(runPrePush(repo).status, 0);
  });

  it("blocks a local-only add on a new branch with no upstream", () => {
    const repo = newRepo();
    const remote = path.join(scratch, `remote-${counter++}.git`);
    git(scratch, ["init", "-q", "--bare", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    commitFiles(repo, { "README.md": "public\n" }, "public");
    git(repo, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

    git(repo, ["checkout", "-q", "-b", "feature/leak"]);
    commitFiles(repo, { "docs/leak.md": "private\n" }, "leak");
    const result = runPrePush(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/leak\.md/);
  });
});
