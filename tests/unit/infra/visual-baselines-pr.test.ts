// Runs scripts/visual-baselines-pr.sh against throwaway git repos. The bare
// "origin" carries a pre-receive hook that refuses any branch whose tree
// differs from main under .github/workflows/, which is what GitHub does to a
// GITHUB_TOKEN push (#1506: run 36539469767 lost 20 regenerated PNGs that way
// when main changed cla.yml mid-run). `gh` is a stub that logs its arguments.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/visual-baselines-pr.sh");
const WORKFLOW = resolve(".github/workflows/update-visual-baselines.yml");
const SHOTS = "tests/e2e/__screenshots__/gui-visual-tools.spec.ts";
const CHANGED = `${SHOTS}/tool-resize-linux.png`;
const ADDED = `${SHOTS}/tool-compress-image-to-100kb-linux.png`;
const UNTOUCHED = `${SHOTS}/tool-crop-linux.png`;
const BRANCH = "chore/visual-baselines-123";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root: string, file: string, contents: string) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), contents);
}

type HookMode = "github" | "refuse-first" | "refuse-all";

/**
 * origin (bare, with the hook), a seed clone that owns main, and a shallow
 * work clone standing in for the runner's actions/checkout at the dispatch SHA.
 */
function setup(hook: HookMode = "github") {
  const dir = mkdtempSync(join(tmpdir(), "visual-baselines-pr-"));
  cleanups.push(dir);
  const origin = join(dir, "origin.git");
  const seed = join(dir, "seed");
  const work = join(dir, "work");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);

  const counter = join(dir, "hook-count");
  const refuseWorkflowDiff = `
while read -r old new ref; do
  [ "$ref" = refs/heads/main ] && continue
  if [ -n "$(git diff --name-only refs/heads/main "$new" -- .github/workflows)" ]; then
    echo "refusing to allow a GitHub App to create or update workflow without workflows permission" >&2
    exit 1
  fi
done`;
  const hooks: Record<HookMode, string> = {
    github: refuseWorkflowDiff,
    "refuse-first": `n=$(cat "${counter}" 2>/dev/null || echo 0); echo $((n + 1)) > "${counter}"
if [ "$n" = 0 ]; then echo "simulated transient refusal" >&2; exit 1; fi
${refuseWorkflowDiff}`,
    "refuse-all": `echo "simulated permanent refusal" >&2; exit 1`,
  };

  git(dir, "clone", "-q", `file://${origin}`, seed);
  write(seed, ".github/workflows/cla.yml", "name: CLA\n");
  write(seed, CHANGED, "old-resize");
  write(seed, UNTOUCHED, "crop");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", "origin", "main");

  // Install the hook only now, so seeding main isn't subject to it.
  const hookPath = join(origin, "hooks", "pre-receive");
  writeFileSync(hookPath, `#!/bin/sh\n${hooks[hook]}\nexit 0\n`);
  chmodSync(hookPath, 0o755);

  git(dir, "clone", "-q", "--depth=1", `file://${origin}`, work);

  // The run regenerates: one baseline changes, one is new.
  write(work, CHANGED, "new-resize");
  write(work, ADDED, "compress-100kb");

  const bin = join(dir, "bin");
  const ghLog = join(dir, "gh.log");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "${ghLog}"\necho https://github.com/example/pull/1\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);

  return { dir, origin, seed, work, bin, ghLog };
}

/** A workflow change lands on main while the run is still rendering. */
function mainChangesAWorkflow(seed: string): string {
  write(seed, ".github/workflows/cla.yml", "name: CLA\non: issue_comment\n");
  git(seed, "commit", "-q", "-am", "ci: change cla.yml mid-run");
  git(seed, "push", "-q", "origin", "main");
  return git(seed, "rev-parse", "HEAD");
}

function run(ctx: ReturnType<typeof setup>, args: string[], env: Record<string, string> = {}) {
  const summary = join(ctx.dir, "summary.md");
  const output = join(ctx.dir, "output.txt");
  const result = spawnSync("bash", [SCRIPT, ...args], {
    cwd: ctx.work,
    encoding: "utf8",
    env: {
      ...gitEnv,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_OUTPUT: output,
      BRANCH,
      RETRY_DELAY: "0",
      ARTIFACT_NAME: "visual-baselines-123",
      ...env,
    },
  });
  const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
  return { ...result, summary: read(summary), output: read(output), gh: read(ctx.ghLog) };
}

function collectAndPush(ctx: ReturnType<typeof setup>, env: Record<string, string> = {}) {
  const staging = join(ctx.dir, "staging");
  const collected = run(ctx, ["collect", staging]);
  expect(collected.status, collected.stderr).toBe(0);
  return { staging, pushed: run(ctx, ["push", join(staging, "changed-baselines.txt")], env) };
}

describe("visual-baselines-pr.sh collect", () => {
  it("stages every new and modified baseline with its repo path, and only those", () => {
    const ctx = setup();
    const staging = join(ctx.dir, "staging");
    const result = run(ctx, ["collect", staging]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("count=2");
    expect(readFileSync(join(staging, "changed-baselines.txt"), "utf8").trim().split("\n")).toEqual(
      [ADDED, CHANGED].sort(),
    );
    expect(readFileSync(join(staging, CHANGED), "utf8")).toBe("new-resize");
    expect(readFileSync(join(staging, ADDED), "utf8")).toBe("compress-100kb");
    expect(existsSync(join(staging, UNTOUCHED))).toBe(false);
    // The summary names modified files too, not only created ones.
    expect(result.summary).toContain(CHANGED);
  });

  it("reports zero when the run changed nothing", () => {
    const ctx = setup();
    git(ctx.work, "checkout", "--", CHANGED);
    rmSync(join(ctx.work, ADDED));
    const result = run(ctx, ["collect", join(ctx.dir, "staging")]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("count=0");
    expect(result.stdout).toContain("No baseline changes.");
  });
});

describe("visual-baselines-pr.sh push", () => {
  it("the fake origin refuses what the old workflow pushed once main changed a workflow", () => {
    const ctx = setup();
    mainChangesAWorkflow(ctx.seed);
    // The pre-#1506 step: branch off the dispatch commit, commit, push.
    git(ctx.work, "checkout", "-q", "-b", BRANCH);
    git(ctx.work, "add", "tests");
    git(ctx.work, "commit", "-q", "-m", "baselines");
    const push = spawnSync("git", ["push", "origin", BRANCH], {
      cwd: ctx.work,
      env: gitEnv,
      encoding: "utf8",
    });
    expect(push.status).not.toBe(0);
    expect(push.stderr).toContain("refusing to allow a GitHub App");
  });

  it("commits onto main's current tip when main changed a workflow mid-run", () => {
    const ctx = setup();
    const newMain = mainChangesAWorkflow(ctx.seed);
    const headBefore = git(ctx.work, "rev-parse", "HEAD");
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(git(ctx.origin, "rev-parse", `${BRANCH}^`)).toBe(newMain);
    expect(git(ctx.origin, "diff", "--name-only", "main", BRANCH).split("\n").sort()).toEqual(
      [ADDED, CHANGED].sort(),
    );
    expect(git(ctx.origin, "show", `${BRANCH}:${CHANGED}`)).toBe("new-resize");
    expect(git(ctx.origin, "show", `${BRANCH}:${ADDED}`)).toBe("compress-100kb");
    // The checkout is left exactly as the run produced it.
    expect(git(ctx.work, "rev-parse", "HEAD")).toBe(headBefore);
    expect(readFileSync(join(ctx.work, CHANGED), "utf8")).toBe("new-resize");

    const ghArgs = pushed.gh.split("\n");
    expect(ghArgs.slice(0, 2)).toEqual(["pr", "create"]);
    expect(ghArgs).toContain("--head");
    expect(ghArgs[ghArgs.indexOf("--head") + 1]).toBe(BRANCH);
    expect(ghArgs[ghArgs.indexOf("--base") + 1]).toBe("main");
    expect(ghArgs).not.toContain("--draft");
    expect(pushed.summary).toContain("https://github.com/example/pull/1");
  });

  it("keeps a run dispatched on a branch that edits a workflow pushable", () => {
    const ctx = setup();
    // The dispatched ref carries its own workflow edit, as a fix branch does.
    write(ctx.work, ".github/workflows/cla.yml", "name: CLA on the fix branch\n");
    git(
      ctx.work,
      "commit",
      "-q",
      "-m",
      "ci: edit cla.yml on the fix branch",
      ".github/workflows/cla.yml",
    );
    const { pushed } = collectAndPush(ctx, { SOURCE_REF: "fix/branch" });

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(git(ctx.origin, "diff", "--name-only", "main", BRANCH).split("\n").sort()).toEqual(
      [ADDED, CHANGED].sort(),
    );
    expect(pushed.gh).toContain("fix/branch");
  });

  it("refetches main and retries when a push is refused", () => {
    const ctx = setup("refuse-first");
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.stdout).toContain("Attempt 2/3");
    expect(git(ctx.origin, "rev-parse", `${BRANCH}^`)).toBe(git(ctx.origin, "rev-parse", "main"));
  });

  it("fails loudly and points at the artifact when every push is refused", () => {
    const ctx = setup("refuse-all");
    const { pushed, staging } = collectAndPush(ctx);

    expect(pushed.status).not.toBe(0);
    expect(pushed.stdout).toContain("Attempt 3/3");
    expect(pushed.stdout).toContain("visual-baselines-123 artifact");
    expect(pushed.summary).toContain("gh run download");
    expect(pushed.summary).toContain("visual-baselines-123");
    expect(pushed.gh).toBe("");
    // The staged copies the artifact uploads are still there.
    expect(readFileSync(join(staging, CHANGED), "utf8")).toBe("new-resize");
  });

  it("opens a draft PR when the regenerate step failed", () => {
    const ctx = setup();
    const { pushed } = collectAndPush(ctx, { REGENERATE_OUTCOME: "failure" });

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.gh.split("\n")).toContain("--draft");
    expect(pushed.gh).toContain("ended `failure`");
  });

  it("opens nothing when main already carries the same PNGs", () => {
    const ctx = setup();
    // Say another run's baseline PR merged while this one rendered.
    write(ctx.seed, CHANGED, "new-resize");
    write(ctx.seed, ADDED, "compress-100kb");
    git(ctx.seed, "add", ".");
    git(ctx.seed, "commit", "-q", "-m", "test(e2e): refresh linux visual baselines");
    git(ctx.seed, "push", "-q", "origin", "main");
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.stdout).toContain("Nothing to push");
    expect(git(ctx.origin, "branch", "--list", BRANCH)).toBe("");
    expect(pushed.gh).toBe("");
  });
});

interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  "continue-on-error"?: boolean;
  with?: Record<string, string>;
}

describe("update-visual-baselines.yml", () => {
  const steps = (
    load(readFileSync(WORKFLOW, "utf8")) as {
      jobs: Record<string, { steps: Step[] }>;
    }
  ).jobs["update-baselines"].steps;
  const index = (predicate: (step: Step) => boolean) => steps.findIndex(predicate);

  const regenerate = index((step) => step.run?.includes("--update-snapshots") ?? false);
  const collect = index((step) => step.run?.includes("visual-baselines-pr.sh collect") ?? false);
  const upload = index((step) => step.uses?.startsWith("actions/upload-artifact@") ?? false);
  const push = index((step) => step.run?.includes("visual-baselines-pr.sh push") ?? false);

  it("keeps going past a failing regenerate step, then fails the job", () => {
    expect(steps[regenerate]["continue-on-error"]).toBe(true);
    expect(steps[regenerate].id).toBe("regenerate");
    const failStep = steps
      .slice(push + 1)
      .find((step) => step.if?.includes("steps.regenerate.outcome"));
    expect(failStep?.run).toContain("exit 1");
  });

  it("only runs projects that write @visual baselines", () => {
    // The webkit device projects grep-invert @visual: they can fail the step
    // but never write a baseline.
    expect(steps[regenerate].run).not.toMatch(/webkit|firefox/);
    expect(steps[regenerate].run).toContain("--project=chromium-visual");
  });

  it("uploads the PNGs before it tries to push them, even after a failure", () => {
    expect(regenerate).toBeGreaterThanOrEqual(0);
    expect(regenerate).toBeLessThan(collect);
    expect(collect).toBeLessThan(upload);
    expect(upload).toBeLessThan(push);
    expect(steps[collect].if).toContain("always()");
    expect(steps[upload].if).toContain("always()");
    expect(steps[upload].with?.path).toContain("visual-baselines");
    expect(steps[upload].uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it("never pushes from the old inline commit-and-push", () => {
    const inline = steps.filter((step) => /git (commit|push)\b/.test(step.run ?? ""));
    expect(inline).toEqual([]);
  });
});
