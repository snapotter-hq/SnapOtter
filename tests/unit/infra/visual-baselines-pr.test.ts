// Runs scripts/visual-baselines-pr.sh against throwaway git repos. The bare
// "origin" carries a pre-receive hook that refuses a branch whose tree
// differs from main under .github/workflows/. That stands in for GitHub
// refusing a GITHUB_TOKEN push that would "create or update" a workflow, as
// it did to run 36539469767 (#1506) when main changed cla.yml mid-run; the
// tests check the script recovers from such a refusal and never loses the
// PNGs, not GitHub's exact rule. `gh` is a stub that logs its arguments.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/visual-baselines-pr.sh");
const WORKFLOW = resolve(".github/workflows/update-visual-baselines.yml");
const PLAYWRIGHT_CONFIG = resolve("playwright.config.ts");
const SHOTS = "tests/e2e/__screenshots__/gui-visual-tools.spec.ts";
const CHANGED = `${SHOTS}/tool-resize-linux.png`;
const ADDED = `${SHOTS}/tool-compress-image-to-100kb-linux.png`;
const UNTOUCHED = `${SHOTS}/tool-crop-linux.png`;
const BRANCH = "chore/visual-baselines-123-1";
const ARTIFACT = "visual-baselines-123-1";

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

function stub(path: string, body: string) {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

type HookMode = "github" | "refuse-all";

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

  const hooks: Record<HookMode, string> = {
    github: `while read -r old new ref; do
  [ "$ref" = refs/heads/main ] && continue
  if [ -n "$(git diff --name-only refs/heads/main "$new" -- .github/workflows)" ]; then
    echo "refusing to allow a GitHub App to create or update workflow without workflows permission" >&2
    exit 1
  fi
done`,
    "refuse-all": `echo "simulated permanent refusal" >&2; exit 1`,
  };

  git(dir, "clone", "-q", `file://${origin}`, seed);
  write(seed, ".github/workflows/cla.yml", "name: CLA\n");
  // The repo's real .gitignore has loose patterns like this one.
  write(seed, ".gitignore", "settings-*.png\n");
  write(seed, CHANGED, "old-resize");
  write(seed, UNTOUCHED, "crop");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", "origin", "main");

  // Install the hook only now, so seeding main isn't subject to it.
  stub(join(origin, "hooks", "pre-receive"), `${hooks[hook]}\nexit 0`);

  git(dir, "clone", "-q", "--depth=1", `file://${origin}`, work);

  // The run regenerates: one baseline changes, one is new.
  write(work, CHANGED, "new-resize");
  write(work, ADDED, "compress-100kb");

  const bin = join(dir, "bin");
  const ghLog = join(dir, "gh.log");
  mkdirSync(bin);
  stub(
    join(bin, "gh"),
    `printf '%s\\n' "$@" >> "${ghLog}"\necho https://github.com/example/pull/1`,
  );

  return { dir, origin, seed, work, bin, ghLog };
}

/** A workflow change lands on main while the run is still rendering. */
function mainChangesAWorkflow(seed: string): string {
  write(seed, ".github/workflows/cla.yml", "name: CLA\non: issue_comment\n");
  git(seed, "commit", "-q", "-am", "ci: change cla.yml mid-run");
  git(seed, "push", "-q", "origin", "main");
  return git(seed, "rev-parse", "HEAD");
}

/** What an all-mode run does to a baseline whose render didn't change. */
function rewriteUntouchedWithSameBytes(ctx: ReturnType<typeof setup>) {
  write(ctx.work, UNTOUCHED, "crop");
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(ctx.work, UNTOUCHED), later, later);
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
      GITHUB_RUN_ID: "123",
      BRANCH,
      SOURCE_REF: "main",
      RETRY_DELAY: "0",
      ARTIFACT_NAME: ARTIFACT,
      // The developer's shell must not pick the PR body's mode.
      UPDATE_SNAPSHOTS: "",
      ...env,
    },
  });
  const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
  return { ...result, summary: read(summary), output: read(output), gh: read(ctx.ghLog) };
}

function collect(ctx: ReturnType<typeof setup>) {
  const staging = join(ctx.dir, "staging");
  const list = join(ctx.dir, "changed-baselines");
  const result = run(ctx, ["collect", staging, list]);
  const listed = existsSync(list) ? readFileSync(list, "utf8").split("\0").filter(Boolean) : [];
  return { staging, list, listed, result };
}

function collectAndPush(ctx: ReturnType<typeof setup>, env: Record<string, string> = {}) {
  const collected = collect(ctx);
  expect(collected.result.status, collected.result.stderr).toBe(0);
  return { ...collected, pushed: run(ctx, ["push", collected.list], env) };
}

function branchFiles(ctx: ReturnType<typeof setup>): string[] {
  return git(ctx.origin, "diff", "--name-only", "-z", "main", BRANCH)
    .split("\0")
    .filter(Boolean)
    .sort();
}

function ghArgs(log: string): string[] {
  return log.split("\n");
}

function flagValue(args: string[], flag: string): string | undefined {
  expect(args).toContain(flag);
  return args[args.indexOf(flag) + 1];
}

describe("visual-baselines-pr.sh collect", () => {
  it("stages every new and modified baseline with its repo path, and only those", () => {
    const ctx = setup();
    const { staging, listed, result } = collect(ctx);

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("count=2");
    expect([...listed].sort()).toEqual([ADDED, CHANGED].sort());
    expect(readFileSync(join(staging, CHANGED), "utf8")).toBe("new-resize");
    expect(readFileSync(join(staging, ADDED), "utf8")).toBe("compress-100kb");
    expect(existsSync(join(staging, UNTOUCHED))).toBe(false);
    // The summary names modified files too, not only created ones.
    expect(result.summary).toContain(CHANGED);
  });

  it("keeps baselines a .gitignore pattern matches and names git would quote", () => {
    const ctx = setup();
    const ignored = `${SHOTS}/settings-panel-linux.png`;
    const accented = `${SHOTS}/tool-café-linux.png`;
    write(ctx.work, ignored, "settings");
    write(ctx.work, accented, "cafe");
    const { staging, listed, pushed } = collectAndPush(ctx);

    expect([...listed].sort()).toEqual([ADDED, CHANGED, ignored, accented].sort());
    expect(readFileSync(join(staging, ignored), "utf8")).toBe("settings");
    expect(readFileSync(join(staging, accented), "utf8")).toBe("cafe");
    expect(pushed.status, pushed.stderr).toBe(0);
    expect(branchFiles(ctx)).toEqual([ADDED, CHANGED, ignored, accented].sort());
  });

  it("leaves out a baseline rewritten with the same bytes", () => {
    // --update-snapshots=all refreshes any baseline whose bytes differ
    // (#1705), so the PR must carry only content changes: a same-bytes
    // rewrite or a bare timestamp change stays out.
    const ctx = setup();
    rewriteUntouchedWithSameBytes(ctx);
    const { staging, listed, result } = collect(ctx);

    expect(result.status, result.stderr).toBe(0);
    expect([...listed].sort()).toEqual([ADDED, CHANGED].sort());
    expect(existsSync(join(staging, UNTOUCHED))).toBe(false);
  });

  it("reports zero when the run changed nothing", () => {
    const ctx = setup();
    git(ctx.work, "checkout", "--", CHANGED);
    rmSync(join(ctx.work, ADDED));
    const { result, listed } = collect(ctx);

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("count=0");
    expect(result.stdout).toContain("No baseline changes.");
    expect([...listed].sort()).toEqual([]);
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
    expect(branchFiles(ctx)).toEqual([ADDED, CHANGED].sort());
    expect(git(ctx.origin, "show", `${BRANCH}:${CHANGED}`)).toBe("new-resize");
    expect(git(ctx.origin, "show", `${BRANCH}:${ADDED}`)).toBe("compress-100kb");
    // The checkout is left exactly as the run produced it.
    expect(git(ctx.work, "rev-parse", "HEAD")).toBe(headBefore);
    expect(readFileSync(join(ctx.work, CHANGED), "utf8")).toBe("new-resize");

    const args = ghArgs(pushed.gh);
    expect(args.slice(0, 2)).toEqual(["pr", "create"]);
    expect(flagValue(args, "--head")).toBe(BRANCH);
    expect(flagValue(args, "--base")).toBe("main");
    expect(args).not.toContain("--draft");
    expect(pushed.summary).toContain("https://github.com/example/pull/1");
  });

  it("opens a draft with restore steps for a run dispatched on a branch that edits a workflow", () => {
    const ctx = setup();
    // The dispatched ref carries its own workflow edit, as a fix branch does.
    write(ctx.work, ".github/workflows/cla.yml", "name: CLA on the fix branch\n");
    git(ctx.work, "commit", "-q", "-m", "ci: edit cla.yml", ".github/workflows/cla.yml");
    const { pushed } = collectAndPush(ctx, { SOURCE_REF: "fix/branch" });

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(branchFiles(ctx)).toEqual([ADDED, CHANGED].sort());
    const args = ghArgs(pushed.gh);
    expect(args).toContain("--draft");
    const body = flagValue(args, "--body") ?? "";
    expect(pushed.gh).toContain("`fix/branch`");
    expect(pushed.gh).toContain(`gh run download 123 -n ${ARTIFACT} -D .`);
    expect(body).toContain("Automated baseline refresh");
  });

  it("fetches main again and retries when main moves between fetch and push", () => {
    const ctx = setup();
    const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
    const moved = join(ctx.dir, "moved");
    // On the script's first push, a workflow change lands on main first, so
    // the commit it's pushing sits on a stale tip and the origin refuses it.
    stub(
      join(ctx.bin, "git"),
      `if [ "$1" = push ] && [ ! -e "${moved}" ]; then
  touch "${moved}"
  printf 'on: push\\n' >> "${ctx.seed}/.github/workflows/cla.yml"
  "${realGit}" -C "${ctx.seed}" commit -q -am "ci: move main during the push"
  "${realGit}" -C "${ctx.seed}" push -q origin main
fi
exec "${realGit}" "$@"`,
    );
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.stderr).toContain("refusing to allow a GitHub App");
    expect(pushed.stdout).toContain("Attempt 2/3");
    expect(existsSync(moved)).toBe(true);
    expect(git(ctx.origin, "rev-parse", `${BRANCH}^`)).toBe(git(ctx.seed, "rev-parse", "HEAD"));
    expect(branchFiles(ctx)).toEqual([ADDED, CHANGED].sort());
  });

  it("fails loudly and points at the artifact when every push is refused", () => {
    const ctx = setup("refuse-all");
    const { pushed, staging } = collectAndPush(ctx);

    expect(pushed.status).not.toBe(0);
    expect(pushed.stdout).toContain("Attempt 3/3");
    expect(pushed.stdout).toContain(`${ARTIFACT} artifact`);
    expect(pushed.summary).toContain(`gh run download 123 -n ${ARTIFACT} -D .`);
    expect(pushed.gh).toBe("");
    // The staged copies the artifact uploads are still there.
    expect(readFileSync(join(staging, CHANGED), "utf8")).toBe("new-resize");
  });

  it("says no copy survived when the upload failed too", () => {
    const ctx = setup("refuse-all");
    const { pushed } = collectAndPush(ctx, { UPLOAD_OUTCOME: "failure" });

    expect(pushed.status).not.toBe(0);
    expect(pushed.stdout).toContain("kept no copy");
    expect(pushed.summary).not.toContain("gh run download");
  });

  it("points at the artifact when building the commit fails, not only when pushing does", () => {
    const ctx = setup();
    const { list } = collect(ctx);
    // A listed file that has vanished makes `git add` fail mid-attempt.
    rmSync(join(ctx.work, ADDED));
    const pushed = run(ctx, ["push", list]);

    expect(pushed.status).not.toBe(0);
    expect(pushed.stdout).toContain(`${ARTIFACT} artifact`);
    expect(pushed.summary).toContain("gh run download");
    expect(git(ctx.origin, "branch", "--list", BRANCH)).toBe("");
  });

  it("says in the PR body that a changed-mode run skips stale baselines under the budget", () => {
    const ctx = setup();
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.gh).toContain("Mode `changed`");
    expect(pushed.gh).toContain("update_snapshots: all");
  });

  it("says in the PR body that an all-mode run refreshed every baseline", () => {
    const ctx = setup();
    rewriteUntouchedWithSameBytes(ctx);
    const { pushed } = collectAndPush(ctx, { UPDATE_SNAPSHOTS: "all" });

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(pushed.gh).toContain("Mode `all`");
    expect(pushed.gh).not.toContain("update_snapshots: all");
    expect(branchFiles(ctx)).toEqual([ADDED, CHANGED].sort());
  });

  it("opens a draft PR when the regenerate step failed", () => {
    const ctx = setup();
    const { pushed } = collectAndPush(ctx, { REGENERATE_OUTCOME: "failure" });

    expect(pushed.status, pushed.stderr).toBe(0);
    expect(ghArgs(pushed.gh)).toContain("--draft");
    expect(pushed.gh).toContain("ended `failure`");
  });

  it("fails when the branch pushed but the PR could not be opened", () => {
    const ctx = setup();
    stub(join(ctx.bin, "gh"), "echo 'GraphQL: something went wrong' >&2; exit 1");
    const { pushed } = collectAndPush(ctx);

    expect(pushed.status).not.toBe(0);
    expect(pushed.stdout).toContain(`Pushed ${BRANCH} but could not open its PR`);
    expect(pushed.summary).toContain("PR not opened");
    expect(git(ctx.origin, "branch", "--list", BRANCH)).toContain(BRANCH);
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
  "timeout-minutes"?: number;
  with?: Record<string, string>;
  env?: Record<string, string>;
}

/** A GitHub Actions expression as it appears in the workflow source. */
const expr = (inner: string) => `$\{{ ${inner} }}`;

interface DispatchInput {
  type?: string;
  options?: string[];
  default?: string;
}

describe("update-visual-baselines.yml", () => {
  const workflow = load(readFileSync(WORKFLOW, "utf8")) as {
    on: { workflow_dispatch: { inputs?: Record<string, DispatchInput> } | null };
    jobs: Record<string, { steps: Step[]; env?: Record<string, string> }>;
  };
  const job = workflow.jobs["update-baselines"];
  const steps = job.steps;
  const find = (predicate: (step: Step) => boolean) => {
    const at = steps.findIndex(predicate);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  };

  const regenerate = find((step) => step.run?.includes("--update-snapshots") ?? false);
  const collectStep = find((step) => step.run?.includes("visual-baselines-pr.sh collect") ?? false);
  const upload = find((step) => step.id === "upload");
  const push = find((step) => step.run?.includes("visual-baselines-pr.sh push") ?? false);

  it("keeps going past a failing regenerate step, then fails the job", () => {
    expect(steps[regenerate]["continue-on-error"]).toBe(true);
    expect(steps[regenerate].id).toBe("regenerate");
    expect(steps[regenerate]["timeout-minutes"]).toBeGreaterThan(0);
    const failStep = steps
      .slice(push + 1)
      .find((step) => step.if?.includes("steps.regenerate.outcome == 'failure'"));
    expect(failStep?.run).toContain("exit 1");
    // With continue-on-error, `conclusion` always reads success; only
    // `outcome` carries the failure into the PR.
    expect(steps[push].env?.REGENERATE_OUTCOME).toBe(expr("steps.regenerate.outcome"));
  });

  it("lets a dispatch ask for every baseline, not only the failing ones (#1705)", () => {
    // changed mode never rewrites a stale baseline that still passes the
    // maxDiffPixelRatio budget; all mode rewrites any whose bytes differ.
    const input = workflow.on.workflow_dispatch?.inputs?.update_snapshots;
    expect(input?.type).toBe("choice");
    expect(input?.options).toEqual(["changed", "all"]);
    expect(input?.default).toBe("changed");

    // One job-level value feeds both the run and the PR body, so the body
    // can't name a mode the run didn't use.
    expect(job.env?.UPDATE_SNAPSHOTS).toBe(expr("inputs.update_snapshots || 'changed'"));
    expect(steps.filter((step) => step.env?.UPDATE_SNAPSHOTS !== undefined)).toEqual([]);
    expect(steps[regenerate].run).toContain('"--update-snapshots=$UPDATE_SNAPSHOTS"');
    // The input reaches the shell through env, never spliced into the script.
    expect(steps[regenerate].run).not.toContain("inputs.");
    // A bare --update-snapshots means changed, whatever the input says.
    expect(steps[regenerate].run).not.toMatch(/--update-snapshots(?!=)/);
  });

  it("describes every mode the input offers in the PR body", () => {
    const options = workflow.on.workflow_dispatch?.inputs?.update_snapshots?.options ?? [];
    const script = readFileSync(SCRIPT, "utf8");
    for (const option of options) {
      expect(script).toContain(`    ${option})\n`);
      expect(script).toContain(`Mode \\\`${option}\\\`:`);
    }
  });

  it("runs exactly the projects that write @visual baselines", () => {
    // The maintained baselines come from VISUAL_SPECS and the device specs.
    // A device project that grep-inverts @visual writes none, and the legacy
    // lane (LEGACY_VISUAL_SPECS) has none maintained anywhere.
    const config = readFileSync(PLAYWRIGHT_CONFIG, "utf8");
    const blocks = config.split(/\n {4}\{\n/).slice(1);
    const visualProjects = blocks
      .filter((block) => /testMatch: (VISUAL_SPECS|DEVICE_SPECS),/.test(block))
      .filter((block) => !/grepInvert: \/@visual\//.test(block))
      .map((block) => /^ {6}name: "([^"]+)",$/m.exec(block)?.[1]);
    const run = steps[regenerate].run ?? "";
    const projects = [...run.matchAll(/--project=(\S+)/g)].map((m) => m[1]).sort();
    expect(projects).toEqual(
      expect.arrayContaining(["chromium-visual", "mobile-chromium", "tablet-chromium"]),
    );
    expect(projects).toEqual([...visualProjects].sort());
    expect(run).not.toMatch(/webkit|firefox/);
  });

  it("uploads the PNGs before it tries to push them, even after a failure", () => {
    expect(regenerate).toBeLessThan(collectStep);
    expect(collectStep).toBeLessThan(upload);
    expect(upload).toBeLessThan(push);
    expect(steps[collectStep].if).toContain("always()");
    expect(steps[upload].if).toContain("always()");
    expect(steps[upload].uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    // The upload reads what collect staged, under the name the push step's
    // failure message tells people to download.
    expect(steps[collectStep].run).toContain('"$RUNNER_TEMP/visual-baselines"');
    expect(steps[upload].with?.path).toBe(`${expr("runner.temp")}/visual-baselines/`);
    expect(steps[upload].with?.name).toBe(expr("env.ARTIFACT_NAME"));
    expect(job.env?.ARTIFACT_NAME).toContain(expr("github.run_attempt"));
    expect(steps[push].env?.UPLOAD_OUTCOME).toBe(expr("steps.upload.outcome"));
  });

  it("keeps the screenshots when collecting them fails", () => {
    const fallback = steps.find((step) => step.if?.includes("steps.collect.outcome == 'failure'"));
    expect(fallback?.uses).toMatch(/^actions\/upload-artifact@/);
    expect(fallback?.with?.path).toBe("tests/e2e/__screenshots__/");
  });

  it("pushes onto main under a branch unique to the run attempt", () => {
    expect(steps[push].env?.BASE_BRANCH).toBe("main");
    expect(steps[push].env?.BRANCH).toContain(
      `${expr("github.run_id")}-${expr("github.run_attempt")}`,
    );
    const inline = steps.filter((step) => /git (commit|push)\b/.test(step.run ?? ""));
    expect(inline).toEqual([]);
  });
});
