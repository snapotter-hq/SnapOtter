// Tests for .husky/pre-push, the guard that keeps local-only paths out of pushes.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PRE_PUSH = path.resolve(import.meta.dirname, "../../../.husky/pre-push");

let scratch;
let counter = 0;

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-test-"));
});
afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function git(dir, args) {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function newRepo() {
  const dir = path.join(scratch, `repo-${counter++}`);
  fs.mkdirSync(dir);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  return dir;
}

function newRemote() {
  const remote = path.join(scratch, `remote-${counter++}.git`);
  git(scratch, ["init", "-q", "--bare", remote]);
  return remote;
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
  const blocked = [
    "docs/plan.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/settings.json",
    ".env",
    "apps/web/.env.local",
    "branding/logo-512.png",
    "scripts/branding/sync-og.sh",
    "scripts/generate-license.mjs",
    "remotion/index.ts",
  ];
  for (const file of blocked) {
    it(`blocks a push that adds ${file}`, () => {
      const repo = newRepo();
      commitFiles(repo, { [file]: "x\n" });
      const result = runPrePush(repo);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toMatch(/local-only paths detected/);
      expect(result.stderr).toContain(file);
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
      expect(runPrePush(repo).status).toBe(0);
    });
  }
});

describe("pre-push guard with an upstream", () => {
  it("allows deleting a path that was already public", () => {
    const repo = newRepo();
    git(repo, ["remote", "add", "origin", newRemote()]);
    commitFiles(repo, { "branding/logo-64.png": "png\n" }, "add logo");
    git(repo, ["push", "-q", "-u", "origin", "HEAD"]);

    git(repo, ["rm", "-q", "branding/logo-64.png"]);
    git(repo, ["commit", "-q", "-m", "drop logo"]);
    expect(runPrePush(repo).status).toBe(0);
  });

  it("blocks a new local-only add on top of an upstream", () => {
    const repo = newRepo();
    git(repo, ["remote", "add", "origin", newRemote()]);
    commitFiles(repo, { "README.md": "public\n" }, "public");
    git(repo, ["push", "-q", "-u", "origin", "HEAD"]);

    commitFiles(repo, { "docs/new-plan.md": "private\n" }, "add plan");
    const result = runPrePush(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/new-plan.md");
  });
});

describe("pre-push guard on a new branch with no upstream", () => {
  // The history is already on the remote. Old public files in it must not block.
  it("checks only unpushed commits", () => {
    const repo = newRepo();
    git(repo, ["remote", "add", "origin", newRemote()]);
    commitFiles(repo, { "branding/dashboard.gif": "gif\n" }, "public history");
    git(repo, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

    git(repo, ["checkout", "-q", "-b", "feature/clean"]);
    commitFiles(repo, { "src/app.ts": "export {};\n" }, "clean change");
    expect(runPrePush(repo).status).toBe(0);
  });

  it("blocks a local-only add on the new branch", () => {
    const repo = newRepo();
    git(repo, ["remote", "add", "origin", newRemote()]);
    commitFiles(repo, { "README.md": "public\n" }, "public");
    git(repo, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

    git(repo, ["checkout", "-q", "-b", "feature/leak"]);
    commitFiles(repo, { "docs/leak.md": "private\n" }, "leak");
    const result = runPrePush(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/leak.md");
  });
});
